"""Чистая логика группировки ленты (без БД): звёзды связей, а не связные компоненты."""
import random
from datetime import datetime, timedelta, timezone

from app.services.feed_groups import Edge, Node, _pick_kind, build_groups

T0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
TYPES = ["observation", "hypothesis", "prediction", "worldview", "question", "task"]


def n(t, i, hours=0):
    return Node((t, i), T0 + timedelta(hours=hours))


def e(a, b, kind="связано"):
    return Edge(a, b, kind)


def obs(i):
    return ("observation", i)


def test_record_without_links_is_its_own_group():
    g = build_groups([n("observation", 1)], [])
    assert len(g) == 1 and g[0].core == obs(1) and g[0].members == () and g[0].size == 1
    assert g[0].outside == () and g[0].internal == ()


def test_star_with_three_observations_is_one_group_with_hypothesis_core():
    nodes = [n("hypothesis", 1)] + [n("observation", i) for i in (2, 3, 4)]
    g = build_groups(nodes, [e(("hypothesis", 1), obs(2), "подтверждает"), e(("hypothesis", 1), obs(3), "опровергает"),
                             e(("hypothesis", 1), obs(4))])
    assert len(g) == 1 and g[0].core == ("hypothesis", 1) and g[0].size == 4
    assert g[0].relation == {obs(2): "подтверждает", obs(3): "опровергает", obs(4): "связано"}
    assert g[0].internal == () and g[0].outside == ()


def test_link_between_two_members_is_kept_in_internal():
    nodes = [n("hypothesis", 1), n("observation", 2), n("observation", 3)]
    g = build_groups(nodes, [e(("hypothesis", 1), obs(2)), e(("hypothesis", 1), obs(3)), e(obs(2), obs(3), "подтверждает")])
    assert len(g) == 1 and g[0].core == ("hypothesis", 1)
    assert g[0].internal == ((obs(2), obs(3), "подтверждает"),)


def test_long_chain_is_split_instead_of_becoming_one_giant_card():
    # цепочка из 30 записей — это и была бы «карточка-монстр» при связных компонентах
    nodes = [n("observation", i) for i in range(30)]
    g = build_groups(nodes, [e(obs(i), obs(i + 1)) for i in range(29)])
    assert len(g) >= 10 and max(x.size for x in g) <= 3


def test_hub_with_many_spokes_stays_one_card_nothing_is_cut():
    nodes = [n("hypothesis", 0)] + [n("observation", i) for i in range(1, 41)]
    g = build_groups(nodes, [e(("hypothesis", 0), obs(i)) for i in range(1, 41)])
    assert len(g) == 1 and g[0].size == 41 and len(g[0].members) == 40


def test_cross_card_link_is_not_lost_it_shows_up_as_outside_on_both_sides():
    # цепочка 1-2-3-4: ядро 2 берёт 1 и 3, запись 4 остаётся одна; связь 3-4 видна с обеих сторон
    nodes = [n("observation", i) for i in (1, 2, 3, 4)]
    g = build_groups(nodes, [e(obs(1), obs(2)), e(obs(2), obs(3)), e(obs(3), obs(4))])
    by_core = {x.core: x for x in g}
    assert sorted(x.size for x in g) == [1, 3]
    assert by_core[obs(2)].outside == (obs(4),)
    assert by_core[obs(4)].outside == (obs(3),)


def test_core_is_most_connected_then_type_priority_then_freshness():
    nodes = [n("observation", 1)] + [n("hypothesis", i) for i in (2, 3, 4)]
    g = build_groups(nodes, [e(obs(1), ("hypothesis", i)) for i in (2, 3, 4)])
    assert g[0].core == obs(1)                       # больше всего связей — даже у наблюдения
    g = build_groups([n("observation", 1, 5), n("hypothesis", 2)], [e(obs(1), ("hypothesis", 2))])
    assert g[0].core == ("hypothesis", 2)            # поровну — тип главнее
    g = build_groups([n("observation", 1, 1), n("observation", 2, 9)], [e(obs(1), obs(2))])
    assert g[0].core == obs(2)                       # поровну и тип тот же — свежее


def test_question_and_task_are_cores_of_their_own_cards():
    nodes = [n("question", 1), n("observation", 2), n("observation", 3), n("task", 4), n("observation", 5)]
    g = build_groups(nodes, [e(("question", 1), obs(2)), e(("question", 1), obs(3)), e(("task", 4), obs(5))])
    assert {x.core for x in g} == {("question", 1), ("task", 4)}
    assert {x.core: set(x.members) for x in g} == {("question", 1): {obs(2), obs(3)}, ("task", 4): {obs(5)}}


def test_group_activity_is_freshest_member_and_groups_sorted_by_it():
    nodes = [n("observation", 1, 1), n("hypothesis", 2, 100), n("question", 3, 50)]
    g = build_groups(nodes, [e(obs(1), ("hypothesis", 2))])
    assert [x.core for x in g] == [("hypothesis", 2), ("question", 3)] and g[0].activity == T0 + timedelta(hours=100)


def test_edge_to_missing_node_does_not_bridge_two_groups():
    # приватная/удалённая запись отсутствует среди узлов: через неё записи склеиваться не должны
    nodes = [n("observation", 1), n("observation", 2)]
    g = build_groups(nodes, [e(obs(1), ("hypothesis", 99)), e(("hypothesis", 99), obs(2))])
    assert len(g) == 2 and all(x.size == 1 and x.outside == () and x.internal == () for x in g)


def test_non_neutral_relation_wins_over_neutral_between_same_pair():
    nodes = [n("observation", 1), n("hypothesis", 2)]
    g = build_groups(nodes, [e(obs(1), ("hypothesis", 2), "связано"), e(obs(1), ("hypothesis", 2), "опровергает")])
    assert g[0].relation[obs(1)] == "опровергает"


def test_random_graphs_every_record_in_one_group_and_every_link_accounted_exactly():
    rnd = random.Random(7)
    for _ in range(300):
        nodes = [n(rnd.choice(TYPES), i, rnd.randint(0, 50)) for i in range(rnd.randint(1, 30))]
        keys = [x.key for x in nodes]
        edges = [e(rnd.choice(keys), rnd.choice(keys), rnd.choice(["связано", "подтверждает", "опровергает"]))
                 for _ in range(rnd.randint(0, 40))]
        groups = build_groups(nodes, edges)

        seen = [k for g in groups for k in (g.core, *g.members)]
        assert sorted(seen) == sorted(keys), "запись пропала или попала в две группы"
        for g in groups:
            assert g.size == 1 + len(g.members) and set(g.relation) == set(g.members)

        by_core = {g.core: g for g in groups}
        where = {k: g.core for g in groups for k in (g.core, *g.members)}
        kinds: dict[frozenset, set[str]] = {}
        for ed in edges:
            if ed.a != ed.b:
                kinds.setdefault(frozenset((ed.a, ed.b)), set()).add(ed.kind)

        for pair, ks in kinds.items():          # каждая связь учтена ровно там, где должна
            a, b = sorted(pair)
            ga, gb = by_core[where[a]], by_core[where[b]]
            if where[a] == where[b]:
                if a == ga.core:
                    assert ga.relation[b] == _pick_kind(ks)
                elif b == ga.core:
                    assert ga.relation[a] == _pick_kind(ks)
                else:
                    assert (a, b, _pick_kind(ks)) in ga.internal
            else:
                assert b in ga.outside and a in gb.outside

        for g in groups:                        # и ничего лишнего: всё, что показано, было на входе
            for a, b, _ in g.internal:
                assert frozenset((a, b)) in kinds
            for o in g.outside:
                assert any(frozenset((k, o)) in kinds for k in (g.core, *g.members))


def test_result_does_not_depend_on_input_order():
    rnd = random.Random(3)
    nodes = [n(rnd.choice(["observation", "hypothesis", "question"]), i, rnd.randint(0, 20)) for i in range(20)]
    keys = [x.key for x in nodes]
    edges = [e(rnd.choice(keys), rnd.choice(keys)) for _ in range(25)]
    base = build_groups(nodes, edges)
    for _ in range(30):
        rnd.shuffle(nodes); rnd.shuffle(edges)
        assert build_groups(nodes, edges) == base, "порядок входа меняет результат — пагинация поедет"


def test_naive_activity_is_rejected_loudly():
    import pytest
    with pytest.raises(ValueError):
        Node(("observation", 1), datetime(2026, 11, 1))


import pytest  # noqa: E402
from app.services.feed_groups import star_around  # noqa: E402


def test_star_around_takes_every_direct_neighbour_even_when_a_neighbour_is_better_connected():
    hyp = ("hypothesis", 2)
    nodes = [n("observation", 1), n("hypothesis", 2), n("observation", 3), n("observation", 4)]
    edges = [e(obs(1), hyp, "подтверждает"), e(hyp, obs(3)), e(hyp, obs(4))]
    assert build_groups(nodes, edges)[0].core == hyp                     # в ленте ядро — гипотеза
    g = star_around(obs(1), nodes, edges)                                # на странице наблюдения оно само в центре
    assert g.core == obs(1) and g.members == (hyp,) and g.size == 2
    assert g.relation == {hyp: "подтверждает"} and g.outside == () and g.internal == ()


def test_star_around_keeps_links_between_neighbours_as_internal():
    hyp = ("hypothesis", 1)
    g = star_around(hyp, [n("hypothesis", 1), n("observation", 2), n("observation", 3)],
                    [e(hyp, obs(2)), e(hyp, obs(3)), e(obs(2), obs(3), "подтверждает")])
    assert set(g.members) == {obs(2), obs(3)} and g.internal == ((obs(2), obs(3), "подтверждает"),)


def test_star_around_orders_members_by_type_then_freshness_and_prefers_informative_relation():
    hyp = ("hypothesis", 1)
    nodes = [n("hypothesis", 1), n("observation", 2, 1), n("observation", 3, 9), n("question", 4, 0)]
    g = star_around(hyp, nodes, [e(hyp, obs(2)), e(hyp, obs(2), "опровергает"), e(hyp, obs(3)), e(hyp, ("question", 4))])
    assert g.members == (("question", 4), obs(3), obs(2))
    assert g.relation[obs(2)] == "опровергает"


def test_star_around_ignores_missing_nodes_and_requires_the_core():
    g = star_around(obs(1), [n("observation", 1), n("observation", 2)], [e(obs(1), ("hypothesis", 99)), e(obs(1), obs(2))])
    assert g.members == (obs(2),)
    assert star_around(obs(1), [n("observation", 1)], []).members == ()
    with pytest.raises(ValueError):
        star_around(obs(5), [n("observation", 1)], [])


def test_star_around_members_are_exactly_the_neighbours_on_random_graphs():
    rnd = random.Random(11)
    for _ in range(200):
        nodes = [n(rnd.choice(TYPES), i, rnd.randint(0, 50)) for i in range(rnd.randint(1, 25))]
        keys = [x.key for x in nodes]
        edges = [e(rnd.choice(keys), rnd.choice(keys + [("observation", 999)])) for _ in range(rnd.randint(0, 40))]
        core = rnd.choice(keys)
        expected = set()
        for ed in edges:
            if ed.a == ed.b:
                continue
            if ed.a == core and ed.b in keys:
                expected.add(ed.b)
            elif ed.b == core and ed.a in keys:
                expected.add(ed.a)
        g = star_around(core, nodes, edges)
        assert set(g.members) == expected and g.size == 1 + len(expected)
        assert star_around(core, list(reversed(nodes)), list(reversed(edges))) == g
