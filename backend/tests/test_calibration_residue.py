"""Калибровка и удаление (решение продукта): удалённый прогноз — в корзине или окончательно —
продолжает считаться в калибровке; «сухой остаток» окончательно удалённого хранит только
уверенность/исход/видимость/теги; счётчик «удалено до проверки» виден рядом с калибровкой."""
import pytest
from sqlalchemy import func, select, text

from app.main import app
from tests.route_utils import iter_api_routes
from app.core.lab_access import entity_visibility_filter, links_alive, links_alive_sql
from app.db.session import AsyncSessionLocal
from app.models.entities import EntityTag, Link, Prediction, PredictionCalibrationResidue as Residue, Tag
from app.services.calibration_source import calibration_rows, deleted_unverified_count
from app.services.hypothesis_evidence import MIN_TAG_CALIBRATION_N, get_tag_calibration_summary
from tests.conftest import create_test_user
from tests.test_soft_delete_api import _build, _delete_url, _login


def _route(fn_name, module):
    for r in iter_api_routes():
        ep = getattr(r, "endpoint", None)
        if ep is not None and ep.__name__ == fn_name and ep.__module__.endswith(module):
            return r.path
    raise AssertionError(f"нет роута {module}.{fn_name}")


def _find(data, key):
    """Ключ может лежать на любой глубине ответа — точная вложенность профиля не важна тесту."""
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for v in data.values():
            found = _find(v, key)
            if found is not None:
                return found
    elif isinstance(data, list):
        for v in data:
            found = _find(v, key)
            if found is not None:
                return found
    return None


def _same(a, b):
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    if isinstance(a, float):
        return abs(a - b) < 1e-9
    return a == b


async def _mk(etype, uid, slug, **attrs):
    async with AsyncSessionLocal() as db:
        o = _build(etype, uid, slug, attrs.pop("dead", False), 1)
        for k, v in attrs.items():
            setattr(o, k, v)
        db.add(o)
        await db.commit()
        await db.refresh(o)
        return o.id


async def _pred(uid, slug, *, status, confidence=80, visibility="private", hypothesis_id=None):
    return await _mk("prediction", uid, slug, status=status, confidence=confidence,
                     visibility=visibility, hypothesis_id=hypothesis_id)


async def _trash(client, pid):
    assert (await client.delete(_delete_url("prediction", pid))).status_code == 204


async def _purge(client, pid):
    await _trash(client, pid)
    assert (await client.delete(f"/api/v1/prediction/{pid}/permanent")).status_code == 204


@pytest.mark.asyncio
async def test_purge_prediction_writes_residue_without_content(client):
    u = await create_test_user("cal_res1")
    hid = await _mk("hypothesis", u.id, "cal-res1-h")
    async with AsyncSessionLocal() as db:
        tag = Tag(user_id=u.id, name="физика")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        db.add(EntityTag(entity_type="hypothesis", entity_id=hid, tag_id=tag.id))
        await db.commit()
    pid = await _pred(u.id, "cal-res1-p", status="не подтвердился", confidence=90,
                      visibility="public", hypothesis_id=hid)
    await _login(client, u.username)
    await _purge(client, pid)

    async with AsyncSessionLocal() as db:
        assert await db.get(Prediction, pid) is None
        rows = (await db.execute(select(Residue))).scalars().all()
        assert len(rows) == 1
        r = rows[0]
        assert (r.user_id, r.confidence, r.status, r.visibility, r.tag_names) == \
               (u.id, 90, "не подтвердился", "public", ["физика"])
    # страж: в остаток не должно попадать содержание — новые колонки требуют осознанного решения
    assert {c.name for c in Residue.__table__.columns} == {
        "id", "user_id", "visibility", "lab_id", "confidence", "status", "is_onboarding", "tag_names", "purged_at",
        "hypothesis_id", "lab_signal_contribution"}  # последние две: число и ссылка, не содержание


@pytest.mark.asyncio
async def test_purge_of_non_prediction_writes_no_residue(client):
    u = await create_test_user("cal_res2")
    oid = await _mk("observation", u.id, "cal-res2-o")
    await _login(client, u.username)
    assert (await client.delete(_delete_url("observation", oid))).status_code == 204
    assert (await client.delete(f"/api/v1/observation/{oid}/permanent")).status_code == 204
    async with AsyncSessionLocal() as db:
        assert (await db.scalar(select(func.count()).select_from(Residue))) == 0


@pytest.mark.asyncio
async def test_profile_stats_and_dashboard_count_trashed_and_purged(client):
    u = await create_test_user("cal_prof")
    p_live = await _pred(u.id, "cal-prof-1", status="подтвердился", visibility="public")
    p_trash = await _pred(u.id, "cal-prof-2", status="не подтвердился", visibility="public")
    p_purge = await _pred(u.id, "cal-prof-3", status="не подтвердился", visibility="public")
    p_priv = await _pred(u.id, "cal-prof-4", status="не подтвердился", visibility="private")
    p_open_trash = await _pred(u.id, "cal-prof-5", status="не проверен", visibility="public")
    p_open_purge = await _pred(u.id, "cal-prof-6", status="не проверен", visibility="public")
    await _login(client, u.username)
    for pid in (p_trash, p_priv, p_open_trash):
        await _trash(client, pid)
    for pid in (p_purge, p_open_purge):
        await _purge(client, pid)

    url = _route("get_profile_stats", "users").replace("{username}", u.username)
    d = (await client.get(url)).json()
    assert _find(d, "n_closed") == 4           # живой + корзина + остаток + приватный в корзине
    assert _find(d, "deleted_unverified") == 2  # открытый в корзине + открытый окончательно удалённый

    client.cookies.clear()                      # гость: приватный закрытый не виден
    d = (await client.get(url)).json()
    assert _find(d, "n_closed") == 3
    assert _find(d, "deleted_unverified") == 2

    await _login(client, u.username)
    dash = (await client.get(_route("get_dashboard", "stats"))).json()
    assert dash["pred_checked"] == 4
    assert dash["pred_accuracy"] == 25.0
    assert dash["pred_deleted_unverified"] == 2
    assert dash["totals"]["predictions"] == 1   # в счётчик записей корзина не входит
    st = (await client.get(_route("get_stats", "stats"))).json()
    assert st["pred_accuracy"] == 25.0 and st["totals"]["predictions"] == 1
    assert st["pred_by_status"] == {"подтвердился": 1}  # разбивка по статусам — только живые
    assert p_live  # прогноз p_live остался живым


@pytest.mark.asyncio
async def test_dashboard_ignores_trashed_hypotheses_and_links_to_trashed(client):
    u = await create_test_user("cal_dash")
    h1 = await _mk("hypothesis", u.id, "cal-dash-h1")
    h2 = await _mk("hypothesis", u.id, "cal-dash-h2")
    h3 = await _mk("hypothesis", u.id, "cal-dash-h3", dead=True)
    o_live = await _mk("observation", u.id, "cal-dash-o1")
    o_dead = await _mk("observation", u.id, "cal-dash-o2", dead=True)
    async with AsyncSessionLocal() as db:
        db.add_all([
            Link(user_id=u.id, from_type="observation", from_id=o_live, to_type="hypothesis", to_id=h1, link_type="подтверждает"),
            Link(user_id=u.id, from_type="observation", from_id=o_dead, to_type="hypothesis", to_id=h1, link_type="подтверждает"),
            Link(user_id=u.id, from_type="observation", from_id=o_live, to_type="hypothesis", to_id=h3, link_type="подтверждает"),
        ])
        await db.commit()
    await _login(client, u.username)
    d = (await client.get(_route("get_dashboard", "stats"))).json()
    bal = {b["id"]: b for b in d["evidence_balance"]}
    assert bal[h1]["conf"] == 1 and h3 not in bal
    no_obs = {x["id"] for x in d["loops"]["hyps_no_obs"]}
    assert h2 in no_obs and h3 not in no_obs and h1 not in no_obs


@pytest.mark.asyncio
async def test_tag_calibration_is_unchanged_by_purge(client):
    u = await create_test_user("cal_tag")
    hid = await _mk("hypothesis", u.id, "cal-tag-h")
    async with AsyncSessionLocal() as db:
        tag = Tag(user_id=u.id, name="тест-тег")
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        db.add(EntityTag(entity_type="hypothesis", entity_id=hid, tag_id=tag.id))
        await db.commit()
    pids = [await _pred(u.id, f"cal-tag-p{i}", status="подтвердился" if i % 2 == 0 else "не подтвердился",
                        hypothesis_id=hid) for i in range(MIN_TAG_CALIBRATION_N)]
    async with AsyncSessionLocal() as db:
        before = await get_tag_calibration_summary(db, u.id, "тест-тег")
    assert before is not None
    await _login(client, u.username)
    await _purge(client, pids[0])
    async with AsyncSessionLocal() as db:
        after = await get_tag_calibration_summary(db, u.id, "тест-тег")
    assert _same(before, after)


@pytest.mark.asyncio
async def test_residue_follows_visibility_policy(client):
    owner = await create_test_user("cal_vis_o")
    other = await create_test_user("cal_vis_x")
    ids = [
        await _pred(owner.id, "cal-vis-1", status="подтвердился", visibility="private"),
        await _pred(owner.id, "cal-vis-2", status="подтвердился", visibility="public"),
        await _pred(owner.id, "cal-vis-3", status="не проверен", visibility="private"),
        await _pred(owner.id, "cal-vis-4", status="не проверен", visibility="public"),
    ]
    await _login(client, owner.username)
    for pid in ids:
        await _purge(client, pid)
    async with AsyncSessionLocal() as db:
        assert len(await calibration_rows(db, owner.id, owner.id)) == 2
        assert len(await calibration_rows(db, owner.id, other.id)) == 1
        assert await deleted_unverified_count(db, owner.id, owner.id) == 2
        assert await deleted_unverified_count(db, owner.id, other.id) == 1


@pytest.mark.asyncio
async def test_entity_visibility_filter_include_deleted_flag(test_user):
    alive = await _pred(test_user.id, "cal-flag-1", status="подтвердился")
    dead = await _mk("prediction", test_user.id, "cal-flag-2", dead=True)
    async with AsyncSessionLocal() as db:
        default = (await db.execute(select(Prediction.id).where(entity_visibility_filter(Prediction, test_user.id)))).scalars().all()
        incl = (await db.execute(select(Prediction.id).where(
            entity_visibility_filter(Prediction, test_user.id, include_deleted=True)))).scalars().all()
    assert alive in default and dead not in default
    assert {alive, dead} <= set(incl)


@pytest.mark.asyncio
async def test_links_alive_sql_matches_orm_links_alive(test_user):
    live = await _mk("observation", test_user.id, "cal-sql-o1")
    dead = await _mk("observation", test_user.id, "cal-sql-o2", dead=True)
    async with AsyncSessionLocal() as db:
        db.add_all([
            Link(user_id=test_user.id, from_type="observation", from_id=live, to_type="hypothesis", to_id=999401),
            Link(user_id=test_user.id, from_type="observation", from_id=dead, to_type="hypothesis", to_id=999402),
            Link(user_id=test_user.id, from_type="hypothesis", from_id=999403, to_type="observation", to_id=dead),
        ])
        await db.commit()
        n_sql = await db.scalar(text(f"SELECT count(*) FROM links l WHERE {links_alive_sql('l')}"))
        n_orm = await db.scalar(select(func.count()).select_from(Link).where(links_alive()))
    assert n_sql == n_orm == 1
