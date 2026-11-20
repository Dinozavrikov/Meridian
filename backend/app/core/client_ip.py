"""IP клиента за обратным прокси. Одно место для геопроверки, записи сессий и лимитов.

Прокси обязан ПЕРЕЗАПИСЫВАТЬ X-Real-IP адресом клиента (на проде nginx:
proxy_set_header X-Real-IP $remote_addr; в Caddyfile репозитория:
header_up X-Real-IP {remote_host}), а порт backend не должен быть доступен снаружи
в обход прокси. Иначе заголовок подделывается. Без прокси (локальная разработка)
возвращается адрес TCP-соединения. request.client.host за прокси дал бы адрес
самого прокси: все клиенты слились бы в один."""
from starlette.requests import Request


def client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")
