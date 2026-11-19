"""Хелпер обхода маршрутов не должен терять роуты: сверяем с openapi независимым путем."""
from app.main import app
from tests.route_utils import iter_api_routes

_HTTP = {"get", "post", "put", "patch", "delete"}


def _spec_ops():
    return {(p, m.upper()) for p, v in app.openapi()["paths"].items() for m in v if m in _HTTP}


def _helper_ops():
    return {(r.path, m) for r in iter_api_routes() for m in r.methods if m not in ("HEAD", "OPTIONS")}


def test_helper_sees_every_openapi_operation():
    lost = sorted(_spec_ops() - _helper_ops())
    assert not lost, f"хелпер потерял операции: {lost}"


def test_helper_returns_only_schema_routes_with_prefix():
    paths = {r.path for r in iter_api_routes()}
    assert not paths & {"/openapi.json", "/api/docs", "/api/redoc", "/docs/oauth2-redirect"}
    assert all(p.startswith("/api") for p in paths)
