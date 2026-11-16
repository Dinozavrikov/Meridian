"""Что бэкенд считает «пустым» rich-text и как строится заголовок из текста."""
import pytest

from app.core.plain_text import plain_text, derive_title


@pytest.mark.parametrize("html", ["", "   ", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>", "<p> </p><p></p>"])
def test_blank_html_is_empty(html):
    assert plain_text(html) == ""


def test_real_text_is_not_empty():
    assert plain_text("<p>Привет, <b>мир</b></p>") == "Привет, мир"


def test_escaped_tag_is_text_not_tag():
    assert plain_text("<p>&lt;b&gt;</p>") == "<b>"


def test_derive_title_collapses_tags_and_whitespace():
    assert derive_title("<p>Первая</p><p>  строка\n\nтекста</p>") == "Первая строка текста"


def test_derive_title_cuts_to_limit():
    assert len(derive_title("слово " * 50)) <= 60


@pytest.mark.parametrize("html", ["", "<p><br></p>", "<p>&nbsp;</p>"])
def test_derive_title_blank_gives_empty(html):
    assert derive_title(html) == ""
