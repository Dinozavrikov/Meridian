from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.entities import Observation, Hypothesis, Prediction, Worldview, Question, ResearchTask
from app.models.social import Lab, LabMember

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/")
async def search(q: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = user.id
    like = f"%{q}%"
    results = []

    for o in (await db.execute(
        select(Observation).where(Observation.user_id == uid, Observation.deleted_at.is_(None), or_(Observation.text.ilike(like), Observation.title.ilike(like)))
    )).scalars():
        results.append({"id": o.id, "type": "observation", "title": o.title, "snippet": o.text[:120], "date": o.date, "status": o.status, "is_own": True})

    for h in (await db.execute(
        select(Hypothesis).where(Hypothesis.user_id == uid, Hypothesis.deleted_at.is_(None), or_(Hypothesis.name.ilike(like), Hypothesis.description.ilike(like)))
    )).scalars():
        results.append({"id": h.id, "type": "hypothesis", "title": h.name, "snippet": h.description[:120], "status": h.status, "is_own": True})

    for p in (await db.execute(
        select(Prediction).where(Prediction.user_id == uid, Prediction.deleted_at.is_(None), or_(Prediction.text.ilike(like), Prediction.result_notes.ilike(like)))
    )).scalars():
        results.append({"id": p.id, "type": "prediction", "title": p.title or p.text[:60], "snippet": p.text[:120], "status": p.status, "confidence": p.confidence, "is_own": True})

    for w in (await db.execute(
        select(Worldview).where(Worldview.user_id == uid, Worldview.deleted_at.is_(None), or_(Worldview.belief.ilike(like), Worldview.confirming_data.ilike(like), Worldview.refuting_data.ilike(like)))
    )).scalars():
        results.append({"id": w.id, "type": "worldview", "title": w.belief[:60], "snippet": w.belief[:120], "status": w.status, "is_own": True})

    for qu in (await db.execute(
        select(Question).where(Question.user_id == uid, Question.deleted_at.is_(None), or_(Question.title.ilike(like), Question.text.ilike(like), Question.answer.ilike(like)))
    )).scalars():
        results.append({"id": qu.id, "type": "question", "title": qu.title, "snippet": qu.text[:120], "status": qu.status, "is_own": True})

    for t in (await db.execute(
        select(ResearchTask).where(ResearchTask.user_id == uid, ResearchTask.deleted_at.is_(None), or_(ResearchTask.name.ilike(like), ResearchTask.description.ilike(like)))
    )).scalars():
        results.append({"id": t.id, "type": "task", "title": t.name, "snippet": t.description[:120], "status": t.status, "is_own": True})

    my_lab_ids = select(LabMember.lab_id).where(LabMember.user_id == uid)
    for l in (await db.execute(
        select(Lab).where(
            or_(Lab.is_public == True, Lab.id.in_(my_lab_ids)),
            or_(Lab.name.ilike(like), Lab.description.ilike(like)),
        )
    )).scalars():
        results.append({
            "id": l.id, "type": "lab", "title": l.name, "snippet": l.description[:120],
            "status": "публичная" if l.is_public else "закрытая",
            "is_own": l.owner_id == uid,
        })

    return {"query": q, "results": results, "total": len(results)}
