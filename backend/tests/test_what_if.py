"""Режим «а что, если»: чистый расчёт без БД. Уровни считаются теми же level_from_signal и
signal_from_evidence, что и боевой пересчёт зрелости."""
from app.services.hypothesis_evidence import what_if, load_bearing


def test_no_exclusion_holds():
    r = what_if(1.9, 0, [(1, 1, 5)])
    assert (r["level_before"], r["level_after"], r["verdict"], r["affected"]) == (1, 1, "held", False)


def test_weakened_when_level_drops_by_one():
    r = what_if(1.9, 0, [(1, 1, 5)], {1})
    assert (r["level_before"], r["level_after"], r["verdict"]) == (1, 0, "weakened")


def test_collapsed_when_level_drops_by_two():
    ev = [(i, 1, 5) for i in range(17)]          # 17 * 0.3 = 5.1 -> уровень 2
    r = what_if(0.0, 0, ev, {i for i, _, _ in ev})
    assert (r["level_before"], r["level_after"], r["verdict"]) == (2, 0, "collapsed")


def test_strengthened_when_refuting_observation_excluded():
    r = what_if(2.1, 0, [(1, -1, 5)], {1})
    assert (r["level_before"], r["level_after"], r["verdict"]) == (0, 1, "strengthened")


def test_excluding_unknown_id_changes_nothing():
    assert what_if(1.9, 0, [(1, 1, 5)], {999})["verdict"] == "held"


def test_risk_raises_thresholds():
    # при risk=10 порог уровня 1 равен 4.0: сигнал 2.2 даёт уровень 0 и без исключений
    assert what_if(1.9, 10, [(1, 1, 5)])["level_before"] == 0


def test_load_bearing_picks_only_the_decisive_observation():
    ev = [(1, 1, 5), (2, 1, 1)]                  # 1.85 + 0.3 + 0.06 = 2.21 -> уровень 1
    assert load_bearing(1.85, 0, ev) == [1]      # без №1: 1.91 -> 0; без №2: 2.15 -> 1


def test_load_bearing_empty_when_nothing_decides():
    assert load_bearing(0.0, 0, [(1, 1, 5)]) == []


def test_signals_and_affected_flag():
    r = what_if(1.9, 0, [(1, 1, 5), (2, 1, 1)], {2})
    assert r["verdict"] == "held" and r["affected"] is True       # уровень тот же, но наблюдение учтено
    assert (r["signal_before"], r["signal_after"]) == (2.26, 2.2)
    assert what_if(1.9, 0, [(1, 1, 5)], {999})["affected"] is False


from app.services.hypothesis_evidence import what_if_delta


def test_delta_excluding_confirmation_is_down_and_affected():
    r = what_if_delta([(1, 1, 5), (2, 1, 3)], {1})
    assert r["affected"] is True and r["direction"] == "down" and abs(r["signal_delta"] + 0.3) < 1e-9


def test_delta_excluding_refutation_is_up():
    assert what_if_delta([(1, -1, 5)], {1})["direction"] == "up"


def test_delta_unknown_or_empty_exclusion_is_none():
    r = what_if_delta([(1, 1, 5)], {999})
    assert (r["affected"], r["signal_delta"], r["direction"]) == (False, 0.0, "none")
    assert what_if_delta([(1, 1, 5)])["affected"] is False
