"""GET /labs/{id}/members — список участников + личный вклад в калибровку лабы (01.10:
объединено из отдельных вкладок "Участники"/"Калибровка" на фронте — два параллельных списка
одних и тех же людей выглядели избыточно; сортировка — на фронте, по уже полученным данным,
без пагинации, как и раньше у списка участников).

Доступ к именам — как был у /members всегда (виден и не-участнику публичной лабы). Калибровка
(n_closed/score_pct) — строго участникам, даже в публичной лабе: сами прогнозы visibility=
'lab'/'public' внутри лабы и так не видны не-участнику в контенте, агрегат не должен
приоткрывать то, что закрыто."""
import pytest

from app.services.hypothesis_evidence import MIN_TAG_CALIBRATION_N
from tests.conftest import add_lab_member, create_test_user

# Минимальный валидный PNG (1x1, прозрачный) — реальная загрузка через POST /users/me/avatar,
# не JSON-заглушка (см. обсуждение: тест должен проверять реальное поведение, а не только
# текстовый маркер/наличие поля в схеме).
_TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844440000000100000001080600000"
    "01f15c4890000000a49444154789c6360000002000155a9f5c9000000"
    "0049454e44ae426082"
)


async def _login(client, username, password="pass12345"):
    r = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _create_lab(client, name, is_public=False):
    r = await client.post("/api/v1/labs", json={
        "name": name, "is_public": is_public, "open_join": False,
        "goal_type": "task", "new_goal_title": f"Goal for {name}",
    })
    assert r.status_code == 200, r.text
    return r.json()


async def _close_lab_pred(client, lab_id, confidence, status, result_notes=""):
    r = await client.post("/api/v1/predictions/", json={
        "title": "p", "text": "will happen", "date_created": "2026-09-29",
        "expected_check_date": "2026-12-01T00:00:00Z", "hypothesis_id": None, "status": "не проверен",
        "confidence": confidence, "result_notes": "", "visibility": "lab", "lab_id": lab_id,
        "confirms_hypothesis_if_true": True,
    })
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    r = await client.put(f"/api/v1/predictions/{pid}/close", json={"status": status, "result_notes": result_notes})
    assert r.status_code == 200, r.text
    return pid


def _members(client, lab_id):
    return client.get(f"/api/v1/labs/{lab_id}/members")


def _find(body, user_id):
    return next(m for m in body if m["user_id"] == user_id)


@pytest.mark.asyncio
async def test_non_member_sees_names_but_not_calibration_in_public_lab(client):
    """Публичная лаба: имена видны всем (как и раньше у /members), калибровка — только
    участникам, даже здесь. Регрессия на прежний строгий доступ /calibration (403), перенесённая
    на поле, а не на весь эндпоинт — теперь сам /members не 403, но числа скрыты."""
    owner = await create_test_user("labm_owner1")
    await _login(client, "labm_owner1")
    lab = await _create_lab(client, "Public Lab", is_public=True)
    for _ in range(MIN_TAG_CALIBRATION_N):
        await _close_lab_pred(client, lab["id"], 80, "подтвердился")

    outsider = await create_test_user("labm_outsider1")
    await _login(client, "labm_outsider1")
    body = (await _members(client, lab["id"])).json()
    m = _find(body, owner.id)
    assert m["username"] == "labm_owner1"  # имя видно
    assert m["n_closed"] == 0 and m["score_pct"] is None  # калибровка скрыта


@pytest.mark.asyncio
async def test_private_lab_still_401_403_for_non_member(client):
    """Закрытая лаба — доступ к самому списку участников не менялся этой задачей."""
    owner = await create_test_user("labm_owner2")
    await _login(client, "labm_owner2")
    lab = await _create_lab(client, "Private Lab", is_public=False)

    await create_test_user("labm_outsider2")
    await _login(client, "labm_outsider2")
    assert (await _members(client, lab["id"])).status_code == 403

    await client.post("/api/v1/auth/logout")
    r = await _members(client, lab["id"])
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_below_threshold_shown_with_count_but_no_score(client):
    owner = await create_test_user("labm_owner3")
    await _login(client, "labm_owner3")
    lab = await _create_lab(client, "Lab3")

    for _ in range(MIN_TAG_CALIBRATION_N - 1):
        await _close_lab_pred(client, lab["id"], 80, "подтвердился")

    body = (await _members(client, lab["id"])).json()
    m = _find(body, owner.id)
    assert m["n_closed"] == MIN_TAG_CALIBRATION_N - 1
    assert m["score_pct"] is None


@pytest.mark.asyncio
async def test_at_threshold_gets_score(client):
    owner = await create_test_user("labm_owner4")
    await _login(client, "labm_owner4")
    lab = await _create_lab(client, "Lab4")

    for _ in range(MIN_TAG_CALIBRATION_N):
        await _close_lab_pred(client, lab["id"], 80, "подтвердился")

    body = (await _members(client, lab["id"])).json()
    m = _find(body, owner.id)
    assert m["n_closed"] == MIN_TAG_CALIBRATION_N
    assert m["score_pct"] is not None and 0 <= m["score_pct"] <= 100


@pytest.mark.asyncio
async def test_good_and_bad_calibration_are_distinguishable(client):
    """Раньше была сортировка на бэкенде ("лучший первый") — теперь сортировка на фронте,
    бэкенд лишь обязан отдать корректные, различимые числа для сравнения на клиенте."""
    owner = await create_test_user("labm_owner5")
    await _login(client, "labm_owner5")
    lab = await _create_lab(client, "Lab5")
    bad = await create_test_user("labm_bad5")
    await add_lab_member(lab["id"], bad.id, "member")

    await _login(client, "labm_owner5")
    for _ in range(MIN_TAG_CALIBRATION_N):
        await _close_lab_pred(client, lab["id"], 90, "подтвердился")  # хорошо откалиброван

    await _login(client, "labm_bad5")
    for _ in range(MIN_TAG_CALIBRATION_N):
        await _close_lab_pred(client, lab["id"], 90, "не подтвердился")  # уверен и неправ

    body = (await _members(client, lab["id"])).json()
    assert _find(body, owner.id)["score_pct"] > _find(body, bad.id)["score_pct"]


@pytest.mark.asyncio
async def test_personal_and_public_and_lab_scopes_do_not_mix(client):
    owner = await create_test_user("labm_scope1")
    await _login(client, "labm_scope1")
    lab = await _create_lab(client, "ScopeLab")

    r = await client.post("/api/v1/predictions/", json={
        "title": "priv", "text": "t", "date_created": "2026-09-29",
        "expected_check_date": "2026-12-01T00:00:00Z", "hypothesis_id": None, "status": "не проверен",
        "confidence": 10, "result_notes": "", "visibility": "private", "lab_id": None,
        "confirms_hypothesis_if_true": True,
    })
    pid = r.json()["id"]
    await client.put(f"/api/v1/predictions/{pid}/close", json={"status": "не подтвердился", "result_notes": ""})

    for _ in range(MIN_TAG_CALIBRATION_N):
        await _close_lab_pred(client, lab["id"], 90, "подтвердился")

    body = (await _members(client, lab["id"])).json()
    assert _find(body, owner.id)["n_closed"] == MIN_TAG_CALIBRATION_N  # приватный не приплюсовался


@pytest.mark.asyncio
async def test_all_members_returned_without_pagination(client):
    """Список участников никогда не пагинировался (как и раньше) — объединение с калибровкой
    не должно было это изменить, даже при полном наборе данных у каждого."""
    owner = await create_test_user("labm_owner6")
    await _login(client, "labm_owner6")
    lab = await _create_lab(client, "Lab6")
    ids = [owner.id]
    for i in range(5):
        m = await create_test_user(f"labm_m6_{i}")
        await add_lab_member(lab["id"], m.id, "member")
        ids.append(m.id)

    body = (await _members(client, lab["id"])).json()
    assert len(body) == len(ids) == 6
    assert {m["user_id"] for m in body} == set(ids)


@pytest.mark.asyncio
async def test_public_lab_predictions_count_despite_visibility_being_public_not_lab(client):
    """Регрессия 02.10: visibility_from_lab (lab_access.py) делает сущности ПУБЛИЧНОЙ лабы
    visibility='public', не 'lab' — rows_for_lab_by_user раньше требовал буквально
    visibility=='lab' и поэтому НИКОГДА не находил прогнозы в публичных лабах. Найдено на живых
    данных: 5 закрытых прогнозов в публичной лабе, рейтинг пустой."""
    owner = await create_test_user("labm_public1")
    await _login(client, "labm_public1")
    lab = await _create_lab(client, "ReallyPublicLab", is_public=True)

    pid = None
    for _ in range(MIN_TAG_CALIBRATION_N):
        pid = await _close_lab_pred(client, lab["id"], 80, "подтвердился")

    r = await client.get(f"/api/v1/predictions/{pid}")
    assert r.json()["visibility"] == "public"  # подтверждаем сам факт: не 'lab'

    body = (await _members(client, lab["id"])).json()
    m = _find(body, owner.id)
    assert m["n_closed"] == MIN_TAG_CALIBRATION_N
    assert m["score_pct"] is not None


@pytest.mark.asyncio
async def test_soft_deleted_lab_prediction_still_counts(client):
    owner = await create_test_user("labm_soft1")
    await _login(client, "labm_soft1")
    lab = await _create_lab(client, "SoftDelLab")

    pids = [await _close_lab_pred(client, lab["id"], 80, "подтвердился") for _ in range(MIN_TAG_CALIBRATION_N)]
    before = _find((await _members(client, lab["id"])).json(), owner.id)
    assert before["n_closed"] == MIN_TAG_CALIBRATION_N

    assert (await client.delete(f"/api/v1/predictions/{pids[0]}")).status_code == 204

    after = _find((await _members(client, lab["id"])).json(), owner.id)
    assert after["n_closed"] == MIN_TAG_CALIBRATION_N  # не убавилось


@pytest.mark.asyncio
async def test_permanently_purged_lab_prediction_still_counts_via_residue(client):
    owner = await create_test_user("labm_purge1")
    await _login(client, "labm_purge1")
    lab = await _create_lab(client, "PurgeLab")

    pids = [await _close_lab_pred(client, lab["id"], 80, "подтвердился") for _ in range(MIN_TAG_CALIBRATION_N)]
    assert (await client.delete(f"/api/v1/predictions/{pids[0]}")).status_code == 204
    assert (await client.delete(f"/api/v1/prediction/{pids[0]}/permanent")).status_code == 204

    m = _find((await _members(client, lab["id"])).json(), owner.id)
    assert m["n_closed"] == MIN_TAG_CALIBRATION_N  # остаток заменил живую строку


@pytest.mark.asyncio
async def test_members_endpoint_includes_real_uploaded_avatar_url(client):
    """avatar_url в MemberOut — фронт рисует аватарку строки через components/ui/avatar.tsx.
    Реальная загрузка через POST /users/me/avatar, не JSON-заглушка."""
    await create_test_user("members_avatar1")
    await _login(client, "members_avatar1")
    lab = await _create_lab(client, "AvatarLab")

    body = (await _members(client, lab["id"])).json()
    assert "avatar_url" in body[0]
    assert body[0]["avatar_url"] is None

    r = await client.post("/api/v1/users/me/avatar", files={"file": ("a.png", _TINY_PNG, "image/png")})
    assert r.status_code == 200, r.text
    uploaded_url = r.json()["avatar_url"]
    assert uploaded_url

    body = (await _members(client, lab["id"])).json()
    assert body[0]["avatar_url"] == uploaded_url
