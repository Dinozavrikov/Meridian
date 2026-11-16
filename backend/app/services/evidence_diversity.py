"""
Индекс разнообразия доказательств для гипотезы: считает не количество
подтверждающих/опровергающих доказательств, а количество НЕЗАВИСИМЫХ
источников среди них — три вида доказательств бакетируются по-разному:

  - Наблюдения (Link) — бакет = автор (нормализованная строка). Одно и то
    же лицо, приведшее пять наблюдений, не даёт пять независимых фактов.
  - Источники (SourceDocument) — бакет = кластер по косинусному сходству
    эмбеддинга СЫРОГО скрапленного текста (см. sources.py::_process_source).
    Перепечатки одного материала на разных доменах схлопываются в один
    бакет — доменное имя ничего не говорит о независимости содержания.
  - Прогнозы (Prediction.hypothesis_id) — один пользователь = один бакет
    на гипотезу, независимо от количества прогнозов: серия прогнозов под
    одними и теми же скрытыми допущениями — структурно один источник
    рассуждений, а не N независимых проверок.

Confirming/refuting считаются раздельно и АСИММЕТРИЧНО (см. обсуждение в
чате): для confirming — узкая база это норма ожидания более широкой
проверки. Для refuting — по Попперу одного надёжного опровержения
достаточно, поэтому предупреждение здесь не "не доверяй", а "перепроверь
перед тем как считать вопрос закрытым".

Best-effort: если эмбеддинги источников недоступны (Ollama не ответила
на этапе индексации), такие источники просто не участвуют в кластеризации
по сходству — не роняем расчёт целиком.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES, CONFIRMED_PREDICTION_STATUSES
from app.models.entities import Link, Observation, SourceDocument, Prediction, Hypothesis
from app.services.embeddings import vectors_for

# Порог косинусного сходства, при котором два источника считаются
# пересказом одного и того же материала, а не независимыми свидетельствами.
# Взято консервативно (выше — реже ложно схлопываем разные источники в один
# бакет; если на практике перепечатки не ловятся, стоит понизить).
SOURCE_SIMILARITY_THRESHOLD = 0.92

# Пороги показа предупреждения — раздельные и НАМЕРЕННО асимметричные
# (см. докстринг модуля, обсуждение в чате): для confirming нужна пара
# единиц доказательства, прежде чем говорить об однобокости, для refuting
# по Попперу хватает и одного — единственное опровержение уже повод
# перепроверить, а не дожидаться второго.
CONFIRMING_MIN_COUNT = 2
REFUTING_MIN_COUNT = 1

# Заявленное держится на узкой базе, если независимых корзин не больше NARROW_BASE.
NARROW_BASE = 1


def _normalize_author(author: str) -> str:
    return (author or "").strip().lower()


async def _confirming_refuting_observations(db: AsyncSession, user_id: int, hyp_id: int):
    rows = (await db.execute(
        select(Link).where(
            Link.user_id == user_id,
            (
                (Link.from_type == "observation") & (Link.to_type == "hypothesis") & (Link.to_id == hyp_id)
            ) | (
                (Link.to_type == "observation") & (Link.from_type == "hypothesis") & (Link.from_id == hyp_id)
            ),
        )
    )).scalars().all()
    if not rows:
        return [], []

    sign_by_obs_id: dict[int, int] = {}
    for r in rows:
        obs_id = r.from_id if r.from_type == "observation" else r.to_id
        if r.link_type == "подтверждает":
            sign_by_obs_id[obs_id] = 1
        elif r.link_type == "опровергает":
            sign_by_obs_id[obs_id] = -1

    if not sign_by_obs_id:
        return [], []

    obs_rows = (await db.execute(
        select(Observation).where(Observation.id.in_(sign_by_obs_id.keys()), Observation.deleted_at.is_(None))
    )).scalars().all()

    confirming = [o for o in obs_rows if sign_by_obs_id.get(o.id) == 1]
    refuting = [o for o in obs_rows if sign_by_obs_id.get(o.id) == -1]
    return confirming, refuting


async def _confirming_refuting_sources(db: AsyncSession, hyp_id: int):
    rows = (await db.execute(
        select(SourceDocument).where(
            SourceDocument.entity_type == "hypothesis",
            SourceDocument.entity_id == hyp_id,
            SourceDocument.status == "done",
        )
    )).scalars().all()
    confirming = [s for s in rows if s.verdict == "confirms"]
    refuting = [s for s in rows if s.verdict == "refutes"]
    return confirming, refuting


async def _source_embeddings(db: AsyncSession, source_ids: list[int]) -> dict[int, list[float]]:
    if not source_ids:
        return {}
    return await vectors_for(db, "source_document", source_ids)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _cluster_sources(sources: list[SourceDocument], embeddings: dict[int, list[float]]) -> int:
    """Жадная кластеризация: каждый источник либо присоединяется к первому
    достаточно похожему уже существующему бакету, либо открывает новый.
    Источники без эмбеддинга (Ollama не ответила) — каждый в своём бакете:
    консервативно считаем их независимыми, а не рискуем ложно схлопнуть."""
    bucket_reps: list[list[float]] = []
    buckets_without_embedding = 0
    for s in sources:
        vec = embeddings.get(s.id)
        if vec is None:
            buckets_without_embedding += 1
            continue
        matched = False
        for rep in bucket_reps:
            if _cosine(vec, rep) >= SOURCE_SIMILARITY_THRESHOLD:
                matched = True
                break
        if not matched:
            bucket_reps.append(vec)
    return len(bucket_reps) + buckets_without_embedding


async def _confirming_refuting_predictions(db: AsyncSession, hyp: Hypothesis):
    rows = (await db.execute(
        select(Prediction).where(
            Prediction.hypothesis_id == hyp.id,
            # deleted_at умышленно НЕ фильтруется: закрытые прогнозы из корзины остаются в track record
            Prediction.user_id == hyp.user_id,
            Prediction.status.in_(CLOSED_PREDICTION_STATUSES),
        )
    )).scalars().all()
    if not rows:
        return 0, 0

    # Эффективное направление = статус прогноза, инвертированный, если
    # прогноз задуман как стресс-тест на опровержение гипотезы.
    has_confirming = False
    has_refuting = False
    for p in rows:
        confirmed = p.status in CONFIRMED_PREDICTION_STATUSES
        effective_confirms = confirmed if p.confirms_hypothesis_if_true else (not confirmed)
        if effective_confirms:
            has_confirming = True
        else:
            has_refuting = True

    # Один пользователь = один бакет на гипотезу, вне зависимости от
    # количества прогнозов — см. докстринг модуля.
    return (1 if has_confirming else 0), (1 if has_refuting else 0)


async def compute_evidence_diversity(db: AsyncSession, hyp: Hypothesis) -> dict:
    confirming_obs, refuting_obs = await _confirming_refuting_observations(db, hyp.user_id, hyp.id)
    confirming_src, refuting_src = await _confirming_refuting_sources(db, hyp.id)
    confirming_pred_buckets, refuting_pred_buckets = await _confirming_refuting_predictions(db, hyp)

    all_source_ids = [s.id for s in confirming_src + refuting_src]
    embeddings = await _source_embeddings(db, all_source_ids)

    confirming_obs_buckets = len(set(_normalize_author(o.author) for o in confirming_obs))
    refuting_obs_buckets = len(set(_normalize_author(o.author) for o in refuting_obs))

    confirming_src_buckets = _cluster_sources(confirming_src, embeddings)
    refuting_src_buckets = _cluster_sources(refuting_src, embeddings)

    confirming_count = len(confirming_obs) + len(confirming_src) + (1 if confirming_pred_buckets else 0)
    refuting_count = len(refuting_obs) + len(refuting_src) + (1 if refuting_pred_buckets else 0)

    confirming_diversity = confirming_obs_buckets + confirming_src_buckets + confirming_pred_buckets
    refuting_diversity = refuting_obs_buckets + refuting_src_buckets + refuting_pred_buckets

    # Confirming: предупреждаем, если заявленное "подтверждается" держится
    # на узкой базе (несколько единиц доказательств, но независимого
    # источника — по сути один).
    confirming_warning = confirming_count >= CONFIRMING_MIN_COUNT and confirming_diversity <= NARROW_BASE

    # Refuting: асимметрично — предупреждаем при ЛЮБОМ количестве, если
    # это единственный независимый источник опровержения. Формулировка —
    # приглашение перепроверить, не индульгенция игнорировать.
    refuting_warning = refuting_count >= REFUTING_MIN_COUNT and refuting_diversity <= NARROW_BASE

    return {
        "confirming": {"count": confirming_count, "diversity": confirming_diversity, "warning": confirming_warning},
        "refuting": {"count": refuting_count, "diversity": refuting_diversity, "warning": refuting_warning},
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_or_compute_evidence_diversity(db: AsyncSession, hyp: Hypothesis, force: bool = False) -> dict:
    """Ленивый пересчёт: если кэш есть и не форсируем — отдаём его.
    Инвалидация — событийная, через invalidate_evidence_diversity ниже,
    вызываемую в местах изменения Link/SourceDocument/Prediction."""
    if not force and hyp.evidence_diversity_cache is not None:
        return hyp.evidence_diversity_cache
    result = await compute_evidence_diversity(db, hyp)
    hyp.evidence_diversity_cache = result
    hyp.diversity_computed_at = datetime.now(timezone.utc)
    return result


def invalidate_evidence_diversity(hyp: Hypothesis) -> None:
    """Сбрасывает кэш — следующий просмотр гипотезы пересчитает заново.
    Не коммитит сама, вызывающий код коммитит вместе с основной транзакцией."""
    hyp.evidence_diversity_cache = None
    hyp.diversity_computed_at = None
