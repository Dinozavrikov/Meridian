"""Токены входа: круг выпуск-проверка, просроченные, подделанные и непохожие на токен отвергаются."""
import base64
import json
import time
from datetime import datetime, timedelta, timezone

import jwt

from app.core import security
from app.core.config import settings


def _b64(d) -> str:
    return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()


def _forge(payload, key=None, alg=None) -> str:
    return jwt.encode(payload, key or settings.SECRET_KEY, algorithm=alg or settings.ALGORITHM)


def _claims(**extra):
    return {"sub": "anna", "exp": datetime.now(timezone.utc) + timedelta(minutes=5), "type": "access", **extra}


def test_access_token_round_trip():
    tok = security.create_access_token("anna")
    payload = security.decode_token_payload(tok)
    assert payload["sub"] == "anna" and payload["type"] == "access"
    assert security.decode_token(tok) == "anna"


def test_refresh_token_carries_its_jti():
    tok, jti = security.create_refresh_token("anna")
    payload = security.decode_token_payload(tok)
    assert payload["jti"] == jti and payload["type"] == "refresh"


def test_expired_token_is_rejected():
    assert security.decode_token_payload(_forge(_claims(exp=datetime.now(timezone.utc) - timedelta(seconds=5)))) is None


def test_wrong_signature_is_rejected():
    assert security.decode_token_payload(_forge(_claims(), key="x" * 48)) is None


def test_other_algorithm_with_the_right_key_is_rejected():
    assert settings.ALGORITHM != "HS512"
    assert security.decode_token_payload(_forge(_claims(), alg="HS512")) is None


def test_unsigned_token_is_rejected():
    tok = f'{_b64({"alg": "none", "typ": "JWT"})}.{_b64({"sub": "anna", "exp": int(time.time()) + 600, "type": "access"})}.'
    assert security.decode_token_payload(tok) is None


def test_garbage_is_rejected():
    for bad in ("", "abc", "a.b.c", "a.b"):
        assert security.decode_token_payload(bad) is None
