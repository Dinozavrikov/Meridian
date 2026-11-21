from bs4 import BeautifulSoup

from app.services.html_truncate import truncate_html


def test_plain_text_is_sliced_like_before():
    assert truncate_html("abcdef", 3) == "abc"
    assert truncate_html(None, 3) == ""


def test_short_html_is_returned_untouched():
    html = "<p>a &amp; b</p>"
    assert truncate_html(html, 100) == html


def test_cut_inside_link_text_keeps_the_link():
    html = '<p>' + "x" * 10 + ' <a href="meridian://question/7">link text here</a> tail</p>'
    out = truncate_html(html, 15)
    assert 'href="meridian://question/7"' in out
    assert "link" in out and "link text" not in out and "tail" not in out


def test_markup_does_not_eat_the_budget():
    html = '<p><a href="https://example.com/' + "a" * 500 + '">ok</a> and more text</p>'
    out = truncate_html(html, 256)
    assert out == html  # видимого текста мало, обрезать нечего


def test_everything_after_the_limit_is_dropped_with_images():
    out = truncate_html('<p>abcdef</p><img src="x.png"><p>zzz</p>', 3)
    assert "abc" in out and "def" not in out and "img" not in out and "zzz" not in out


def test_result_has_no_unclosed_tags():
    out = truncate_html('<p>one <b>two <a href="/x">three</a></b> four</p>', 9)
    assert str(BeautifulSoup(out, "html.parser")) == out
    assert out.count("<a") == out.count("</a>") and out.count("<b>") == out.count("</b>")


def test_comments_and_scripts_do_not_count():
    out = truncate_html("<!-- " + "c" * 300 + " --><script>" + "s" * 300 + "</script><p>hello</p>", 10)
    assert "hello" in out and "ccc" not in out and "sss" not in out
