"""extract_mentions: что считается упоминанием в HTML-тексте записи. Чистая функция, без БД."""
import pytest

from app.core.entity_registry import ENTITY_MODELS
from app.core.mentions import INT32_MAX, MAX_MENTIONS_PER_FIELD, extract_mentions


def _a(href, text="x"):
    return f'<a href="{href}">{text}</a>'


def test_finds_link_in_nested_markup():
    html = f'<ul><li>см. {_a("meridian://hypothesis/5", "Г")}</li></ul>'
    assert extract_mentions(html) == [("hypothesis", 5)]


def test_order_of_first_appearance_and_no_duplicates():
    html = _a("meridian://task/3") + _a("meridian://hypothesis/5") + _a("meridian://task/3")
    assert extract_mentions(html) == [("task", 3), ("hypothesis", 5)]


def test_every_base_entity_type_and_result_are_accepted():
    for t in list(ENTITY_MODELS) + ["result"]:
        assert extract_mentions(_a(f"meridian://{t}/7")) == [(t, 7)], t


@pytest.mark.parametrize("href", [
    "meridian://user/3",                 # тип вне реестра
    "meridian://Hypothesis/5",           # регистр: фронт (parseEntityHref) такое не узнаёт
    "meridian://hypothesis/5/extra",
    "meridian://hypothesis/5?x=1",
    "meridian://hypothesis/",
    "https://example.com/hypothesis/5",
    "meridian://hypothesis/\u0663",      # арабско-индийская цифра: \d в Python её принял бы, фронт нет
    "meridian://hypothesis/0",
    "meridian://hypothesis/99999999999999999999",
    f"meridian://hypothesis/{INT32_MAX + 1}",
])
def test_not_a_mention(href):
    assert extract_mentions(_a(href)) == []


def test_int32_max_is_accepted_and_whitespace_trimmed():
    assert extract_mentions(_a(f" meridian://task/{INT32_MAX} ")) == [("task", INT32_MAX)]


def test_literal_text_is_not_a_mention():
    assert extract_mentions("<p>meridian://hypothesis/5</p>") == []
    assert extract_mentions('<a href="https://example.com">l</a>&lt;a href="meridian://hypothesis/5"&gt;x&lt;/a&gt;') == []


@pytest.mark.parametrize("empty", [None, "", "<p></p>"])
def test_empty_input(empty):
    assert extract_mentions(empty) == []


def test_limit_per_field_keeps_first_ones_in_order():
    html = "".join(_a(f"meridian://task/{i}") for i in range(1, MAX_MENTIONS_PER_FIELD + 51))
    got = extract_mentions(html)
    assert len(got) == MAX_MENTIONS_PER_FIELD
    assert got == [("task", i) for i in range(1, MAX_MENTIONS_PER_FIELD + 1)]
