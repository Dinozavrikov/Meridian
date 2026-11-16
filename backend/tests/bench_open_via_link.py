"""ЗАМЕР (не тест): цена условия «открыта через связь» на списке наблюдений. Запуск по имени файла, в полный прогон не входит."""
import random
import time

import pytest
from sqlalchemy import or_, select, text
from sqlalchemy.dialects import postgresql

from app.core.lab_access import entity_visibility_filter, opened_via_link_condition
from app.db.session import AsyncSessionLocal
from app.models.entities import Link, Observation, RecordShare
from app.models.social import Lab, LabMember
from app.models.user import User

USERS, LABS, OBS_PER_USER, LINKS = 40, 10, 500, 8000


async def _seed():
    rnd = random.Random(7)
    async with AsyncSessionLocal() as db:
        users = [User(username=f"bn{i}", email=f"bn{i}@x.io", password_hash="x", display_name=f"bn{i}") for i in range(USERS)]
        db.add_all(users); await db.flush()
        uids = [u.id for u in users]
        labs = [Lab(owner_id=uids[i], name=f"L{i}", slug=f"bench-{i}", is_public=False) for i in range(LABS)]
        db.add_all(labs); await db.flush()
        lab_ids = [l.id for l in labs]
        members = {}                                   # lab -> участники (8 на лабораторию, по кругу)
        for li, lid in enumerate(lab_ids):
            members[lid] = [uids[(li * 4 + k) % USERS] for k in range(8)]
            db.add_all([LabMember(lab_id=lid, user_id=u, role="owner" if k == 0 else "member") for k, u in enumerate(members[lid])])
        await db.flush()
        lab_of = {u: next((l for l in lab_ids if u in members[l]), None) for u in uids}
        objs = []
        for u in uids:
            for k in range(OBS_PER_USER):
                shared = k % 3 == 0 and lab_of[u] is not None
                objs.append(Observation(user_id=u, date="2026-09-23", author="a", title=f"t{k}", slug=f"b{u}-{k}", text="x", status="осмысленное",
                                        visibility="lab" if shared else "private", lab_id=lab_of[u] if shared else None))
        for i in range(0, len(objs), 2000):
            db.add_all(objs[i:i + 2000]); await db.flush()
        by_user = {}
        for o in objs:
            by_user.setdefault(o.user_id, {"priv": [], "lab": []})["lab" if o.visibility == "lab" else "priv"].append(o.id)
        links = []
        for _ in range(LINKS):
            u = rnd.choice([x for x in uids if by_user[x]["lab"]])
            links.append(Link(user_id=u, from_type="observation", from_id=rnd.choice(by_user[u]["priv"]),
                              to_type="observation", to_id=rnd.choice(by_user[u]["lab"]), link_type="связано"))
        uniq = list({(l.user_id, l.from_id, l.to_id): l for l in links}.values())   # без дублей (уникальность Link)
        db.add_all(uniq)
        db.add_all({("observation", l.from_id, lab_of[l.user_id], l.to_id): RecordShare(entity_type="observation", entity_id=l.from_id, lab_id=lab_of[l.user_id], via_type="observation", via_id=l.to_id, granted_by=l.user_id) for l in uniq}.values())
        await db.commit()
        return uids[0]


async def _best(db, stmt, n=5):
    t = []
    for _ in range(n):
        t0 = time.perf_counter(); rows = (await db.execute(stmt)).scalars().all(); t.append(time.perf_counter() - t0)
    return min(t) * 1000, len(rows)


async def _explain(db, stmt):
    sql = str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    lines = [r[0] for r in (await db.execute(text("EXPLAIN (ANALYZE, BUFFERS) " + sql))).all()]
    return [l for l in lines if "Execution Time" in l or "Planning Time" in l]


@pytest.mark.asyncio
async def test_bench_open_via_link():
    viewer = await _seed()
    strict = select(Observation.id).where(entity_visibility_filter(Observation, viewer), Observation.deleted_at.is_(None))
    both = select(Observation.id).where(or_(entity_visibility_filter(Observation, viewer),
                                            opened_via_link_condition(Observation, "observation", viewer)), Observation.deleted_at.is_(None))
    async with AsyncSessionLocal() as db:
        await db.execute(text("ANALYZE"))
        for name, stmt in (("строгий фильтр", strict), ("строгий + через связь", both)):
            ms, n = await _best(db, stmt)
            print(f"BENCH {name}: {ms:.1f} мс, строк {n}, {' | '.join(await _explain(db, stmt))}")
