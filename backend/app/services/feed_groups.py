"""Группировка записей ленты в карточки — одна карточка на «звезду» связей.

Чистые функции без БД: на вход видимые записи (узлы) и связи между ними (рёбра), на выход группы.

Почему не связные компоненты: нейтральные связи «связано» склеивают всё подряд — на проде 21 из 45
публичных записей оказались бы в одной карточке. Поэтому группа — звезда: ядро и его прямые соседи.
Принципы:
- Каждая запись попадает ровно в одну группу, поэтому дублей карточек быть не может.
- Каждый член группы связан с ядром напрямую, тип этой связи известен (relation).
- Связь между двумя спутниками (не через ядро) не теряется: internal.
- Связи, ведущие в другие карточки, не теряются: outside — записи, с которыми группа связана, но
  которые лежат в других карточках (для «ещё связано с …»).
- Рёбра, чей конец не в наборе узлов (приватная или удалённая запись), игнорируются и ничего не склеивают.
- Результат не зависит от порядка входных данных (стабильная пагинация).
Алгоритм жадный: ядро — запись с наибольшим числом ещё не размещённых соседей; при равенстве главнее тип,
затем свежее, затем ключ. Куча с ленивым пересчётом: число свободных соседей только убывает, поэтому
устаревшую запись достаточно пересчитать при извлечении."""
import heapq
from dataclasses import dataclass
from datetime import datetime

Key = tuple[str, int]  # (entity_type, entity_id)

# При равенстве числа свободных соседей ядром становится запись более «главного» типа.
TYPE_PRIORITY = ["hypothesis", "question", "task", "prediction", "worldview", "observation"]
NEUTRAL_KINDS = {"связано", "related"}


@dataclass(frozen=True)
class Node:
    key: Key
    activity: datetime  # последняя активность записи (создание, привязка, смена статуса); обязательно timezone-aware

    def __post_init__(self):
        if self.activity.tzinfo is None:
            raise ValueError("Node.activity должен быть timezone-aware: наивное и aware-время нельзя сравнивать")


@dataclass(frozen=True)
class Edge:
    a: Key
    b: Key
    kind: str  # link_type или "competing" (конкурирующая гипотеза)


@dataclass(frozen=True)
class Group:
    core: Key
    members: tuple[Key, ...]          # без ядра; по типу (TYPE_PRIORITY), внутри — свежие первыми
    activity: datetime                # самая свежая активность в группе
    relation: dict[Key, str]          # тип связи каждого члена с ядром (связь всегда прямая)
    size: int                         # записей в группе, включая ядро
    outside: tuple[Key, ...]          # записи других карточек, с которыми группа связана
    internal: tuple[tuple[Key, Key, str], ...]  # связи между двумя спутниками (a, b, тип), a < b


def _prio(entity_type: str) -> int:
    return TYPE_PRIORITY.index(entity_type) if entity_type in TYPE_PRIORITY else len(TYPE_PRIORITY)


def _pick_kind(kinds: set[str]) -> str:
    informative = sorted(k for k in kinds if k not in NEUTRAL_KINDS)
    return informative[0] if informative else sorted(kinds)[0]


def build_groups(nodes: list[Node], edges: list[Edge]) -> list[Group]:
    by_key = {n.key: n for n in nodes}
    nbrs: dict[Key, dict[Key, set[str]]] = {k: {} for k in by_key}
    for e in edges:
        if e.a == e.b or e.a not in by_key or e.b not in by_key:
            continue
        nbrs[e.a].setdefault(e.b, set()).add(e.kind)
        nbrs[e.b].setdefault(e.a, set()).add(e.kind)

    # статический порядок для равенств: тип главнее, затем свежее, затем ключ — уникален, значит детерминирован
    order = sorted(by_key, key=lambda k: (_prio(k[0]), -by_key[k].activity.timestamp(), k))
    rank = {k: i for i, k in enumerate(order)}

    unassigned = set(by_key)
    heap = [(-len(nbrs[k]), rank[k], k) for k in by_key]
    heapq.heapify(heap)
    raw: list[tuple[Key, list[Key]]] = []
    while heap:
        neg_free, r, k = heapq.heappop(heap)
        if k not in unassigned:
            continue
        free = sum(1 for m in nbrs[k] if m in unassigned)
        if free != -neg_free:               # запись устарела: соседей разобрали, пересчитываем и возвращаем
            heapq.heappush(heap, (-free, r, k))
            continue
        members = [m for m in nbrs[k] if m in unassigned]
        unassigned.discard(k)
        unassigned.difference_update(members)
        raw.append((k, members))

    group_of: dict[Key, Key] = {}
    for core, members in raw:
        group_of[core] = core
        for m in members:
            group_of[m] = core

    groups: list[Group] = []
    for core, members in raw:
        members_sorted = sorted(members, key=lambda k: (_prio(k[0]), -by_key[k].activity.timestamp(), k))
        keys = [core, *members_sorted]
        outside = sorted({o for k in keys for o in nbrs[k] if group_of[o] != core})
        member_set = set(members_sorted)
        internal = sorted((m, o, _pick_kind(nbrs[m][o]))
                          for m in members_sorted for o in nbrs[m] if o in member_set and m < o)
        groups.append(Group(
            core=core, members=tuple(members_sorted),
            activity=max(by_key[k].activity for k in keys),
            relation={m: _pick_kind(nbrs[core][m]) for m in members_sorted},
            size=len(keys), outside=tuple(outside), internal=tuple(internal),
        ))
    groups.sort(key=lambda g: (g.activity, g.core), reverse=True)
    return groups


def star_around(core: Key, nodes: list[Node], edges: list[Edge]) -> Group:
    """Карточка вокруг ОДНОЙ записи — для её страницы: ядро — она сама, члены — ВСЕ её прямые соседи среди узлов.
    В отличие от build_groups ядро не выбирается жадно по всей ленте: запись, которая в ленте стала спутником чужой
    карточки, на своей странице остаётся в центре (обсуждение идёт про неё). Связи между самими соседями —
    internal; ничего не скрывается, поэтому outside пуст."""
    by_key = {n.key: n for n in nodes}
    if core not in by_key:
        raise ValueError("ядро должно быть среди узлов")
    nbrs: dict[Key, dict[Key, set[str]]] = {k: {} for k in by_key}
    for e in edges:
        if e.a == e.b or e.a not in by_key or e.b not in by_key:
            continue
        nbrs[e.a].setdefault(e.b, set()).add(e.kind)
        nbrs[e.b].setdefault(e.a, set()).add(e.kind)
    members = sorted(nbrs[core], key=lambda k: (_prio(k[0]), -by_key[k].activity.timestamp(), k))
    member_set = set(members)
    internal = sorted((m, o, _pick_kind(nbrs[m][o])) for m in members for o in nbrs[m] if o in member_set and m < o)
    keys = [core, *members]
    return Group(
        core=core, members=tuple(members), activity=max(by_key[k].activity for k in keys),
        relation={m: _pick_kind(nbrs[core][m]) for m in members}, size=len(keys), outside=(), internal=tuple(internal),
    )
