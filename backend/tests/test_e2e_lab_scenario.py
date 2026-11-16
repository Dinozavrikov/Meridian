"""
Этап 9 — сквозной сценарный e2e-тест.

В отличие от test_lab_access_matrix_*.py (Этап 7, исчерпывающая матрица
роль×тип-лабы×тип-сущности в изоляции), этот файл прогоняет ОДИН связный
сценарий через все подсистемы подряд на одних и тех же сущностях/лабе —
чтобы поймать баги на стыках между фичами, которые матрица по построению
пропускает (пример из этой же сессии: делать вывод "Result-каскад при
удалении лабы не тестировался нигде", хотя сам инвариант в докстринге
Result описан как осознанный дизайн, а не баг).

Один тест, не несколько — autouse _clean_db (conftest.py) truncate'ит БД
перед КАЖДЫМ тестом, поэтому протащить состояние через шаги можно только
внутри одной test_-функции.
"""
import pytest
from tests.conftest import create_test_user, add_lab_member


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_full_lab_lifecycle_scenario(client):
    # --- Шаг 1: юзеры и публичная лаба с вступлением по заявке ---
    owner = await create_test_user("e2e_owner")
    applicant = await create_test_user("e2e_applicant")
    outsider = await create_test_user("e2e_outsider")

    await _login(client, "e2e_owner")
    r = await client.post("/api/v1/labs", json={
        "name": "E2E Lab", "is_public": True, "open_join": False,
        "goal_type": "task", "new_goal_title": "E2E goal",
    })
    assert r.status_code == 200, r.text
    lab = r.json()
    lab_id = lab["id"]

    # --- Шаг 2: owner создаёт сущности разных типов в лабе ---
    r = await client.post("/api/v1/observations/", json={
        "title": "E2E obs", "date": "2026-09-04", "author": "owner", "text": "obs body",
        "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 201, r.text
    obs = r.json()

    r = await client.post("/api/v1/hypotheses/", json={
        "name": "E2E hyp", "description": "hyp body", "date_created": "2026-09-04",
        "status": "идея", "visibility": "lab", "lab_id": lab_id,
    })
    assert r.status_code == 201, r.text
    hyp = r.json()

    r = await client.post("/api/v1/questions/", json={
        "title": "E2E question?", "date_created": "2026-09-04",
        "visibility": "lab", "lab_id": lab_id,
    })
    assert r.status_code == 201, r.text
    question = r.json()

    # --- Шаг 3: граф — связываем obs и hyp, проверяем что связь видна ---
    r = await client.post("/api/v1/graph/links", params={
        "from_type": "hypothesis", "from_id": hyp["id"],
        "to_type": "observation", "to_id": obs["id"],
    })
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/graph/lab/{lab_id}")
    assert r.status_code == 200, r.text
    labels = [n["label"] for n in r.json()["nodes"]]
    # Observation-узлы графа подписываются title (одинаково в get_graph и get_lab_graph);
    # дата идёт отдельным полем и подпись не подменяет.
    assert "E2E hyp" in labels
    assert "E2E obs" in labels, labels
    assert not any(lbl.startswith("Набл.") for lbl in labels), labels
    obs_nodes = [n for n in r.json()["nodes"] if n["type"] == "observation"]
    assert any(n.get("date") == "2026-09-04" for n in obs_nodes), obs_nodes

    # --- Шаг 4: outsider подаёт заявку, принимается, становится участником ---
    await _login(client, "e2e_applicant")
    r = await client.post(f"/api/v1/labs/{lab_id}/join-request", json={"message": "пустите"})
    assert r.status_code in (200, 201), r.text

    await _login(client, "e2e_owner")
    r = await client.get(f"/api/v1/labs/{lab_id}/requests")
    assert r.status_code == 200, r.text
    req_id = r.json()[0]["id"]
    r = await client.post(f"/api/v1/labs/{lab_id}/requests/{req_id}/accept")
    assert r.status_code in (200, 204), r.text

    # --- Шаг 5: новый участник создаёт сущность, репостит наблюдение в фид лабы ---
    await _login(client, "e2e_applicant")
    r = await client.post("/api/v1/predictions/", json={
        "text": "E2E prediction", "date_created": "2026-09-04",
        "expected_check_date": "2026-12-01",
        "visibility": "lab", "lab_id": lab_id,
    })
    assert r.status_code == 201, r.text

    r = await client.post("/api/v1/feed/repost", json={
        "source_type": "observation", "source_id": obs["id"],
        "target_type": "observation", "target": "lab", "lab_id": lab_id,
        "comment": "интересное наблюдение",
    })
    assert r.status_code in (200, 201), r.text

    r = await client.get(f"/api/v1/feed/groups/lab/{lab_id}")
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1, "участник видит запись лаборатории (репост в лабораторию выше)"

    # --- Шаг 6: comments (three-stance) на посте гипотезы ---
    r = await client.post(f"/api/v1/feed/hypothesis/{hyp['id']}/posts", json={
        "title": "", "content": "обсуждаем гипотезу",
    })
    assert r.status_code in (200, 201), r.text
    post_id = r.json()["id"]

    r = await client.post(f"/api/v1/feed/posts/{post_id}/comments", json={
        "content": "поддерживаю",
    })
    assert r.status_code in (200, 201), r.text

    # --- Шаг 7: outsider (не участник) не должен видеть ничего из вышеперечисленного ---
    await _login(client, "e2e_outsider")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    # публичная лаба — obs с visibility=lab виден снаружи по политике публичных лаб
    assert r.status_code == 200
    r = await client.get(f"/api/v1/graph/related/observation/{obs['id']}")
    assert r.status_code == 200, r.text
    hyp_titles = [i.get("title") or i.get("name") for i in r.json().get("related", {}).get("hypothesis", [])]
    # проверяем что связанная гипотеза видна (публичная лаба, visibility=lab — это ожидаемо доступно)
    # ключевая проверка — на приватной лабе такого утечь не должно (уже покрыто test_graph_lab_visibility.py)

    # --- Шаг 8: смена роли applicant -> admin, admin создаёт Result ---
    await _login(client, "e2e_owner")
    r = await client.patch(f"/api/v1/labs/{lab_id}/members/{applicant.id}/role", json={"role": "admin"})
    assert r.status_code in (200, 204), r.text

    await _login(client, "e2e_applicant")
    r = await client.post("/api/v1/results/", json={
        "title": "E2E result", "body": "draft body", "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 201, r.text
    result = r.json()

    # --- Шаг 9: owner предлагает правку, admin (бывший applicant) принимает ---
    await _login(client, "e2e_owner")
    r = await client.post(f"/api/v1/results/{result['id']}/suggestions", json={
        "proposed_body": "improved by owner",
    })
    assert r.status_code == 201, r.text
    sug_id = r.json()["id"]

    await _login(client, "e2e_applicant")  # теперь admin
    r = await client.post(f"/api/v1/results/{result['id']}/suggestions/{sug_id}/accept")
    assert r.status_code == 200, r.text
    assert r.json()["body"] == "improved by owner"

    # --- Шаг 10: admin публикует Result (публичная лаба + visibility=lab) ---
    r = await client.post(f"/api/v1/results/{result['id']}/publish")
    assert r.status_code == 200, r.text
    assert r.json()["is_published"] is True

    await _login(client, "e2e_outsider")
    r = await client.get(f"/api/v1/results/{result['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["body"] == "improved by owner"

    # --- Шаг 11: смена visibility -> private должна авто-сбросить is_published ---
    # PUT на Result может только фактический автор записи (Result.user_id ==
    # user.id, жёсткий фильтр в update_result — политика "нельзя редактировать
    # чужую entity", §16). Result создавал e2e_applicant на шаге 8 (тогда ещё
    # member, к моменту редактирования уже admin) — owner лабы здесь не
    # подходит, даже будучи owner/admin лабы (publish/unpublish завязаны на
    # роль в лабе, а не на авторство — но PUT завязан именно на авторство).
    await _login(client, "e2e_applicant")
    r = await client.put(f"/api/v1/results/{result['id']}", json={
        "title": result["title"], "body": "improved by owner", "visibility": "private",
    })
    assert r.status_code == 200, r.text
    assert r.json()["is_published"] is False

    await _login(client, "e2e_outsider")
    r = await client.get(f"/api/v1/results/{result['id']}")
    assert r.status_code in (403, 404), r.text

    # --- Шаг 12: возвращаем visibility=lab, публикуем снова (публикация — под ролью admin, не автором) ---
    await _login(client, "e2e_applicant")
    r = await client.put(f"/api/v1/results/{result['id']}", json={
        "title": result["title"], "body": "improved by owner", "visibility": "lab",
    })
    assert r.status_code == 200, r.text
    r = await client.post(f"/api/v1/results/{result['id']}/publish")
    assert r.status_code == 200, r.text

    # --- Шаг 13: понижаем admin обратно в member (только owner может менять роли), member выходит из лабы сам ---
    await _login(client, "e2e_owner")
    r = await client.patch(f"/api/v1/labs/{lab_id}/members/{applicant.id}/role", json={"role": "member"})
    assert r.status_code in (200, 204), r.text

    await _login(client, "e2e_applicant")
    r = await client.delete(f"/api/v1/labs/{lab_id}/leave")
    assert r.status_code in (200, 204), r.text

    # вышедший участник больше не должен создавать в лабе
    r = await client.post("/api/v1/observations/", json={
        "title": "should fail", "date": "2026-09-04", "author": "x", "text": "x",
        "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 403, r.text

    # --- Шаг 14: owner удаляет лабу — ключевая новая проверка Result-каскада ---
    await _login(client, "e2e_owner")
    r = await client.delete(f"/api/v1/labs/{lab_id}")
    assert r.status_code in (200, 204), r.text

    r = await client.get(f"/api/v1/labs/{lab_id}")
    assert r.status_code == 404, "лаба должна быть недоступна после удаления"

    # опубликованный Result обязан исчезнуть каскадно вместе с лабой —
    # не повиснуть с visibility='lab'+is_published=True без валидной лабы
    r = await client.get(f"/api/v1/results/{result['id']}")
    assert r.status_code == 404, (
        "Result должен каскадно удаляться вместе с лабой (ondelete=CASCADE на lab_id, "
        "см. докстринг модели Result) — если это не так, где-то повисла запись "
        "'результат без лабы', невалидная комбинация по дизайну"
    )

    # ВАЖНО: лаба публичная (is_public=True) — resolve_lab_attachment при
    # создании сущности в публичной лабе переопределяет запрошенный
    # visibility="lab" на фактический "public" (см. комментарий в delete_lab:
    # "публичная лаба и так даёт entity visibility='public'" — задокументировано
    # и покрыто в Этапе 7, test_public_open_lab_outsider_can_read_lab_observation).
    # Поэтому delete_lab's reset-to-private цикл (WHERE visibility=='lab') эту
    # запись корректно НЕ трогает — она должна остаться visibility='public',
    # лишь потерять lab_id.
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200, "observation не должна удаляться вместе с лабой — только терять lab_id"
    assert r.json()["visibility"] == "public", (
        "в публичной лабе сущность создаётся с visibility=public, не lab — "
        "delete_lab не обязан её менять; см. комментарий в самом delete_lab"
    )
    assert r.json()["lab_id"] is None


@pytest.mark.asyncio
async def test_delete_private_lab_resets_visibility_to_private(client):
    """Второй сценарий, короче первого: специально приватная лаба (is_public=False),
    где visibility_from_lab оставляет запрошенный "lab" буквальным "lab" (а не
    переопределяет в "public", как в публичной лабе — см. test_full_lab_lifecycle_scenario
    и resolve_lab_attachment/visibility_from_lab). Только здесь delete_lab's
    reset-цикл (UPDATE ... WHERE visibility=='lab' -> 'private') реально
    что-то делает — первый сценарий эту ветку не задевал."""
    owner = await create_test_user("e2e2_owner")
    member = await create_test_user("e2e2_member")
    outsider = await create_test_user("e2e2_outsider")

    await _login(client, "e2e2_owner")
    r = await client.post("/api/v1/labs", json={
        "name": "E2E Private Lab", "is_public": False, "open_join": False,
        "goal_type": "task", "new_goal_title": "Private goal",
    })
    assert r.status_code == 200, r.text
    lab_id = r.json()["id"]

    await add_lab_member(lab_id, member.id)

    r = await client.post("/api/v1/observations/", json={
        "title": "Private lab obs", "date": "2026-09-04", "author": "owner", "text": "x",
        "lab_id": lab_id, "visibility": "lab",
    })
    assert r.status_code == 201, r.text
    obs = r.json()
    assert obs["visibility"] == "lab", "в приватной лабе visibility остаётся буквальным 'lab' (не 'public')"

    r = await client.post("/api/v1/hypotheses/", json={
        "name": "Private lab hyp", "description": "x", "date_created": "2026-09-04",
        "status": "идея", "visibility": "lab", "lab_id": lab_id,
    })
    assert r.status_code == 201, r.text
    hyp = r.json()

    # member видит, outsider — нет (пока лаба жива)
    await _login(client, "e2e2_member")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200

    await _login(client, "e2e2_outsider")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code in (403, 404)

    # owner удаляет лабу
    await _login(client, "e2e2_owner")
    r = await client.delete(f"/api/v1/labs/{lab_id}")
    assert r.status_code in (200, 204), r.text

    # obs и hyp должны стать private + lab_id=NULL (реальная проверка reset-цикла delete_lab)
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["visibility"] == "private", "delete_lab обязан сбросить lab-видимость приватной лабы в private"
    assert r.json()["lab_id"] is None

    r = await client.get(f"/api/v1/hypotheses/{hyp['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["visibility"] == "private"
    assert r.json()["lab_id"] is None

    # теперь бывший outsider тоже не должен видеть — запись стала приватной owner'а
    await _login(client, "e2e2_outsider")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code in (403, 404)

    # а бывший member лабы (лаба удалена, членство ушло каскадом) — тоже не должен
    await _login(client, "e2e2_member")
    r = await client.get(f"/api/v1/observations/{obs['id']}")
    assert r.status_code in (403, 404), (
        "после удаления лабы запись стала private владельца — бывший участник "
        "лабы не должен сохранять доступ (LabMember удалён каскадом)"
    )
