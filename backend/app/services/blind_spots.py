"""Слепые зоны графа: что в знаниях не проверено или не связано. Чистая функция, БД не трогает.
Подробности выборки данных (личный граф / лаборатория) лежат в эндпоинтах graph.py."""

RULES = ("no_falsification", "only_confirmations", "no_predictions", "prediction_overdue", "observation_orphan")


def find_blind_spots(hyps, preds, observations, links, evidence_by_hyp, now, open_status, node_keys=None) -> list[dict]:
    """hyps/preds/observations: ORM-подобные объекты; links: [(from_key, to_key)] вида "o_5";
    evidence_by_hyp: {hyp_id: [(obs_id, знак, важность)]}; node_keys: если задан, связь учитывается,
    только когда оба её конца в этом наборе (лаборатория)."""
    out: list[dict] = []

    def add(rule, typ, prefix, obj, label):
        out.append({"rule": rule, "type": typ, "node_id": f"{prefix}_{obj.id}", "eid": obj.id, "label": label})

    hyps_with_pred = {p.hypothesis_id for p in preds if p.hypothesis_id}
    for h in hyps:
        if not (h.falsification_criteria or "").strip():
            add("no_falsification", "hypothesis", "h", h, h.name)
        signs = {sign for _, sign, _ in evidence_by_hyp.get(h.id, [])}
        if 1 in signs and -1 not in signs:
            add("only_confirmations", "hypothesis", "h", h, h.name)
        if h.id not in hyps_with_pred:
            add("no_predictions", "hypothesis", "h", h, h.name)

    for p in preds:
        if p.status == open_status and p.expected_check_date is not None and p.expected_check_date < now:
            add("prediction_overdue", "prediction", "p", p, (p.text or "")[:60])

    connected: set[str] = set()
    for a, b in links:
        if node_keys is None or (a in node_keys and b in node_keys):
            connected.update((a, b))
    for o in observations:
        if f"o_{o.id}" not in connected:
            add("observation_orphan", "observation", "o", o, o.title)
    return out
