from app.services.html_translate import drop_markers, has_markup, mask_html, unmask_html

SRC = '<p>See <a href="meridian://question/7">this question</a> now</p>'


def test_mask_replaces_every_tag_and_remembers_them():
    masked, tags = mask_html(SRC)
    assert masked == "[[0]]See [[1]]this question[[2]] now[[3]]"
    assert tags[1] == '<a href="meridian://question/7">'


def test_roundtrip_restores_href_from_the_original():
    masked, tags = mask_html(SRC)
    out = unmask_html("[[0]]Смотрите [[1]]этот вопрос[[2]] сейчас[[3]]", tags)
    assert out == '<p>Смотрите <a href="meridian://question/7">этот вопрос</a> сейчас</p>'


def test_spaces_inside_markers_are_tolerated():
    _, tags = mask_html(SRC)
    assert unmask_html("[[ 0 ]]A [[1 ]]b[[ 2]] c[[3]]", tags) is not None


def test_lost_or_duplicated_marker_gives_none():
    _, tags = mask_html(SRC)
    assert unmask_html("[[0]]A [[1]]b[[2]] c", tags) is None
    assert unmask_html("[[0]]A [[1]]b[[1]][[2]] c[[3]]", tags) is None


def test_broken_nesting_gives_none():
    _, tags = mask_html(SRC)
    assert unmask_html("[[0]]A [[2]]b[[1]] c[[3]]", tags) is None


def test_markup_added_by_the_model_gives_none():
    _, tags = mask_html(SRC)
    out = unmask_html('[[0]]A <a href="javascript:alert(1)">b</a> [[1]]c[[2]][[3]]', tags)
    assert out is None


def test_marker_like_text_in_source_drops_markup_instead_of_guessing():
    masked, tags = mask_html("<p>array [[0]] here</p>")
    assert tags == [] and "<" not in masked


def test_fallback_removes_markers_and_extra_spaces():
    assert drop_markers("[[0]]Смотрите [[1]]этот вопрос[[2]]  сейчас[[3]]") == "Смотрите этот вопрос сейчас"


def test_has_markup():
    assert has_markup(SRC) and not has_markup("plain text")


def test_restore_keeps_links_or_falls_back_to_clean_plain_text():
    from app.services.html_translate import restore_html
    _, tags = mask_html(SRC)
    ok = restore_html("[[0]]Смотрите [[1]]этот вопрос[[2]] сейчас[[3]]", tags)
    assert '<a href="meridian://question/7">' in ok
    bad = restore_html('[[0]]A <a href="javascript:alert(1)">b</a> &amp; c', tags)
    assert "<" not in bad
    assert restore_html("hello &amp; bye", []) == "hello & bye"
