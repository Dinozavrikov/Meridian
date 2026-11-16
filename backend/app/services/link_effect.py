"""Эффект связи на сигнал гипотезы — одно место для /graph/related и /preview.

Берёт числа, которые уже есть: у закрытого прогноза — сохранённый вклад (predictions.signal_contribution,
с калибровкой на момент закрытия, ничего не пересчитывается), у наблюдения — формула сигнала наблюдений
(signal_from_evidence). Своей формулы здесь нет, иначе она разошлась бы с реальным сигналом.

kind: counted — вклад учтён (value); pending — открытый прогноз, учтётся при закрытии (value 0.0);
unknown — закрыт до появления колонки, размер не сохранён; not_counted — связь в сигнал не идёт
(нейтральная, чужая). None — зритель не должен видеть эффект."""
from sqlalchemy import and_, or_, select

from app.core.lab_access import get_live, links_alive
from app.core.prediction_status import CLOSED_PREDICTION_STATUSES
from app.models.entities import Hypothesis, Link
from app.services.hypothesis_evidence import observation_evidence, signal_from_evidence, foreign_observation_signal


def can_see_effect(viewer_id: int | None, hyp) -> bool:
    """Кто видит размер эффекта. Сейчас только владелец гипотезы: вклад закрытого прогноза включает
    калибровочный множитель автора. Для лабораторий меняется только эта функция."""
    return viewer_id is not None and hyp.user_id == viewer_id


async def can_see_lab_effect(db, viewer_id: int | None, hyp) -> bool:
    """Лабораторная часть эффекта: владелец гипотезы, участники и владелец лаборатории (не для приватной записи).
    Личная часть (с калибровкой владельца) по-прежнему только по can_see_effect."""
    if viewer_id is None or hyp.lab_id is None or hyp.visibility == "private":
        return False
    if hyp.user_id == viewer_id:
        return True
    from app.models.social import Lab, LabMember
    if await db.scalar(select(LabMember.user_id).where(LabMember.lab_id == hyp.lab_id, LabMember.user_id == viewer_id)) is not None:
        return True
    return await db.scalar(select(Lab.id).where(Lab.id == hyp.lab_id, Lab.owner_id == viewer_id)) is not None


async def _lab_effect(viewer_id, hyp, other_type: str, other, db, cache: dict) -> dict | None:
    """Вклад связи в сигнал лаборатории: value, mine (доля зрителя как автора записи), votes (у наблюдения)."""
    if other_type == "prediction":
        if other.hypothesis_id != hyp.id or other.lab_id != hyp.lab_id or other.status not in CLOSED_PREDICTION_STATUSES:
            return None
        v = other.lab_signal_contribution
        if v is None:
            return None
        return {"value": v, "mine": v if other.user_id == viewer_id else 0.0, "votes": None}
    if other_type == "observation":
        key = ("lab", hyp.id)
        if key not in cache:
            d: dict = {}
            await foreign_observation_signal(db, hyp, d)
            cache[key] = d
        d = cache[key].get(other.id)
        if d is None:
            return None
        return {"value": d["value"], "mine": d["value"] if other.user_id == viewer_id else 0.0,
                "votes": {"n": d["n"], "mean": d["mean"]}}
    return None


async def pair_effect(db, viewer_id: int | None, hyp, other_type: str, other, obs_cache: dict) -> dict | None:
    """Эффект связи гипотезы hyp с записью other: личная часть (владельцу) и блок lab (владельцу и участникам
    лаборатории). Участнику приходит kind=lab_only без личного числа. obs_cache общий на запрос."""
    personal = await _personal_effect(db, viewer_id, hyp, other_type, other, obs_cache) if can_see_effect(viewer_id, hyp) else None
    lab = await _lab_effect(viewer_id, hyp, other_type, other, db, obs_cache) if await can_see_lab_effect(db, viewer_id, hyp) else None
    if lab is None:
        return personal
    return {**(personal or {"kind": "lab_only", "value": None}), "lab": lab}


async def _personal_effect(db, viewer_id, hyp, other_type: str, other, obs_cache: dict) -> dict | None:
    """Личная часть эффекта (с калибровкой владельца). obs_cache: {hyp.id: {obs_id: вклад}}."""
    if other_type == "prediction":
        if other.hypothesis_id != hyp.id:
            return None
        if other.status not in CLOSED_PREDICTION_STATUSES:
            return {"kind": "pending", "value": 0.0}
        if other.signal_contribution is None:
            return {"kind": "unknown", "value": None}
        return {"kind": "counted", "value": other.signal_contribution}
    if other_type == "observation":
        if hyp.id not in obs_cache:
            obs_cache[hyp.id] = {oid: signal_from_evidence([(oid, sign, imp)])
                                 for oid, sign, imp in await observation_evidence(db, hyp.user_id, hyp.id)}
        value = obs_cache[hyp.id].get(other.id)
        return {"kind": "not_counted", "value": None} if value is None else {"kind": "counted", "value": value}
    return None


async def preview_effects(db, viewer_id: int | None, entity_type: str, obj) -> tuple[dict | None, list[dict]]:
    """(effect, effects) для карточки предпросмотра — общая для /preview и превью узла графа.
    Прогноз: effect — вклад в сигнал его гипотезы. Наблюдение: effects — по записи на каждую ГИПОТЕЗУ ЗРИТЕЛЯ,
    с которой оно связано (чужие гипотезы не показываются). Остальным типам — (None, [])."""
    if viewer_id is None:
        return None, []
    if entity_type == "prediction":
        hyp = await get_live(db, Hypothesis, obj.hypothesis_id) if obj.hypothesis_id else None
        return (await pair_effect(db, viewer_id, hyp, "prediction", obj, {}) if hyp else None), []
    if entity_type != "observation":
        return None, []
    links = (await db.execute(select(Link).where(links_alive(), or_(
        and_(Link.from_type == "observation", Link.from_id == obj.id, Link.to_type == "hypothesis"),
        and_(Link.to_type == "observation", Link.to_id == obj.id, Link.from_type == "hypothesis"))))).scalars().all()
    hyp_ids = sorted({lk.to_id if lk.from_type == "observation" else lk.from_id for lk in links})
    cache: dict = {}
    out: list[dict] = []
    for hid in hyp_ids:
        hyp = await get_live(db, Hypothesis, hid)
        if hyp is None or not (can_see_effect(viewer_id, hyp) or await can_see_lab_effect(db, viewer_id, hyp)):
            continue
        out.append({"hypothesis_id": hid, "hypothesis_name": hyp.name,
                    "effect": await pair_effect(db, viewer_id, hyp, "observation", obj, cache)})
    return None, out
