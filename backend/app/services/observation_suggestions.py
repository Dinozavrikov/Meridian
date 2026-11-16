"""
Подбор наблюдений, потенциально релевантных гипотезе, — по требованию
(кнопка), не в фоне. Переиспользует уже существующую инфраструктуру
эмбеддингов (find_similar, та же, что у contradictions.py).

Философия та же, что у reflection/contradictions: ИИ не решает за
пользователя, что подтверждает гипотезу, а что нет — только предлагает
кандидатов с дефолтной нейтральной связью "связано". Направление
"подтверждает"/"опровергает" предлагается только при экстрактивном
совпадении цитаты и высокой уверенности модели (см. find_contradictions).
Финальное решение и link_type всегда за пользователем — привязка
происходит только по явному подтверждению, никогда автоматически.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Observation, Link, Hypothesis
from app.services.embeddings import find_similar
from app.services.ai import classify_observation_relations

CANDIDATE_LIMIT = 8


async def suggest_observations_for_hypothesis(db: AsyncSession, user_id: int, hyp: Hypothesis) -> list[dict]:
    hyp_text = f"{hyp.name}. {hyp.description or ''}"

    # top_k с запасом — после фильтрации по entity_type и уже привязанным
    # может остаться меньше CANDIDATE_LIMIT кандидатов-наблюдений.
    raw = await find_similar(db, user_id, hyp_text, exclude_entity_type="hypothesis", exclude_entity_id=hyp.id, top_k=20)
    obs_candidates = [c for c in raw if c["entity_type"] == "observation"]
    if not obs_candidates:
        return []

    candidate_ids = [c["entity_id"] for c in obs_candidates]

    # Уже привязанные к ЭТОЙ гипотезе (любым link_type) — не предлагаем повторно.
    already_linked_rows = (await db.execute(
        select(Link.from_id, Link.to_id, Link.from_type, Link.to_type).where(
            Link.user_id == user_id,
            (
                (Link.from_type == "observation") & (Link.from_id.in_(candidate_ids)) & (Link.to_type == "hypothesis") & (Link.to_id == hyp.id)
            ) | (
                (Link.to_type == "observation") & (Link.to_id.in_(candidate_ids)) & (Link.from_type == "hypothesis") & (Link.from_id == hyp.id)
            )
        )
    )).all()
    already_linked_to_this = set()
    for from_id, to_id, from_type, to_type in already_linked_rows:
        already_linked_to_this.add(from_id if from_type == "observation" else to_id)

    obs_candidates = [c for c in obs_candidates if c["entity_id"] not in already_linked_to_this][:CANDIDATE_LIMIT]
    if not obs_candidates:
        return []

    candidate_ids = [c["entity_id"] for c in obs_candidates]

    # Привязки к ДРУГИМ гипотезам — не блокируем, просто показываем пользователю
    # как контекст (см. обсуждение в чате: одно наблюдение законно может
    # относиться к нескольким гипотезам, решение — за пользователем).
    other_hyp_rows = (await db.execute(
        select(Link.from_id, Link.to_id, Link.from_type, Link.to_type, Hypothesis.id, Hypothesis.name)
        .join(Hypothesis, (
            ((Link.from_type == "hypothesis") & (Link.from_id == Hypothesis.id)) |
            ((Link.to_type == "hypothesis") & (Link.to_id == Hypothesis.id))
        ))
        .where(
            Link.user_id == user_id,
            (
                (Link.from_type == "observation") & (Link.from_id.in_(candidate_ids)) & (Link.to_type == "hypothesis") & (Link.to_id != hyp.id)
            ) | (
                (Link.to_type == "observation") & (Link.to_id.in_(candidate_ids)) & (Link.from_type == "hypothesis") & (Link.from_id != hyp.id)
            ),
            Hypothesis.deleted_at.is_(None),  # не подсказываем именем гипотезы из корзины
        )
    )).all()
    other_hyps_by_obs: dict[int, list[dict]] = {}
    for from_id, to_id, from_type, to_type, other_hyp_id, other_hyp_name in other_hyp_rows:
        obs_id = from_id if from_type == "observation" else to_id
        other_hyps_by_obs.setdefault(obs_id, []).append({"id": other_hyp_id, "name": other_hyp_name})

    obs_rows = (await db.execute(select(Observation).where(Observation.id.in_(candidate_ids), Observation.deleted_at.is_(None)))).scalars().all()
    obs_by_id = {o.id: o for o in obs_rows}

    classification_input = [
        {"entity_id": c["entity_id"], "text": obs_by_id[c["entity_id"]].text}
        for c in obs_candidates if c["entity_id"] in obs_by_id
    ]
    classified = await classify_observation_relations(hyp_text, classification_input)
    classified_by_id = {c["entity_id"]: c for c in classified}

    result = []
    for c in obs_candidates:
        obs = obs_by_id.get(c["entity_id"])
        if not obs:
            continue
        cls = classified_by_id.get(obs.id, {})
        result.append({
            "observation_id": obs.id,
            "title": obs.title or obs.text[:80],
            "text_snippet": obs.text[:200],
            "suggested_link_type": cls.get("relation", "связано"),
            "quote": cls.get("quote"),
            "already_linked_to": other_hyps_by_obs.get(obs.id, []),
        })
    return result
