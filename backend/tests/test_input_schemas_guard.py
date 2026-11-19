"""Охрана санитизации: каждая ВХОДНАЯ схема API наследует StrictIn (иначе NUL в ней снова даёт 500),
и реальное поведение: NUL/управляющие символы отвергаются, обычный текст (\\n, \\t, HTML) проходит."""
import pytest
from pydantic import BaseModel, ValidationError

import app.main  # noqa: F401  — импортирует все роутеры, схемы становятся видны
from tests.route_utils import iter_api_routes
from app.schemas._strict import StrictIn

OUT_SUFFIX = ("Out", "Response", "Page")
# AttachmentTextReplace: NUL отвергается самим эндпоинтом (400), тест вложений опирается на этот ответ
EXEMPT = {"AttachmentTextReplace", "FeedItem", "HistoryItem", "TrashItem", "UnreadItem", "StageListItem", "ContradictionItem", "QuestionAnswerItem"}


def _all(cls):
    for s in cls.__subclasses__():
        yield s
        yield from _all(s)


def _input_schemas():
    return {c for c in _all(BaseModel)
            if c.__module__.startswith(("app.api", "app.schemas")) and not c.__name__.endswith(OUT_SUFFIX)
            and c.__name__ not in EXEMPT}


def test_every_input_schema_is_strict():
    loose = sorted(f"{c.__module__}.{c.__name__}" for c in _input_schemas() if not issubclass(c, StrictIn))
    assert not loose, f"входные схемы без StrictIn: {loose}"


def test_input_schemas_were_actually_found():
    assert len(_input_schemas()) > 40  # защита от «тест пуст, потому что ничего не нашлось»


def test_nul_rejected_and_normal_text_accepted():
    from app.api.v1.comments import CommentIn
    from app.api.v1.feed import PostIn
    from app.api.v1.messages import MessageCreate
    from app.api.v1.labs import JoinRequestIn
    from app.api.v1.i18n import EnsureRequest
    for ok_bad in [(CommentIn, {"content": "a"}, "content"), (PostIn, {"content": "a"}, "content"),
                   (MessageCreate, {"content": "a"}, "content"), (JoinRequestIn, {"message": "a"}, "message")]:
        cls, base, field = ok_bad
        cls(**{**base, field: "строка\nтаб\t<b>html</b>"})
        with pytest.raises(ValidationError):
            cls(**{**base, field: "a\x00b"})
        with pytest.raises(ValidationError):
            cls(**{**base, field: "a\x1fb"})
    EnsureRequest(strings={"k": "v"})
    with pytest.raises(ValidationError):
        EnsureRequest(strings={"k": "v\x00"})   # вложенный dict тоже сканируется
    with pytest.raises(ValidationError):
        EnsureRequest(strings={"k\x00": "v"})   # и ключи


def test_no_route_takes_a_bare_dict_body():
    """Тело запроса — всегда схема: body: dict пишет любые поля и даёт 500 на мусоре."""
    import inspect
    bad = []
    for r in iter_api_routes():
        ep = getattr(r, "endpoint", None)
        if ep is None:
            continue
        for name, p in inspect.signature(ep).parameters.items():
            if name == "body" and p.annotation in (dict, "dict"):
                bad.append(f"{ep.__module__}.{ep.__name__}")
    assert not bad, f"роуты с body: dict: {bad}"
