from starlette.requests import Request

from app.core.client_ip import client_ip


def _req(headers: dict[str, str], client=("10.0.0.5", 1234)) -> Request:
    return Request({"type": "http", "client": client,
                    "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_real_ip_header_wins_over_connection_address():
    assert client_ip(_req({"X-Real-IP": "203.0.113.7"})) == "203.0.113.7"


def test_falls_back_to_connection_address_without_header():
    assert client_ip(_req({})) == "10.0.0.5"


def test_empty_header_falls_back_to_connection_address():
    assert client_ip(_req({"X-Real-IP": ""})) == "10.0.0.5"


def test_no_client_and_no_header_gives_empty_string():
    assert client_ip(_req({}, client=None)) == ""
