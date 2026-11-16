"""
Определение страны по IP через локальную DB-IP Country Lite базу (CC BY 4.0,
атрибуция на странице логина обязательна — не убирать). Используется для
гео-гейтинга Google OAuth (см. auth.py) — российское законодательство
запрещает использование Google для авторизации на российских сайтах.

Reader открывается один раз при импорте модуля (процесс-level синглтон) —
не на каждый запрос: сам geoip2.database.Reader — это mmap над файлом,
переоткрытие на каждый вызов было бы чистым расточительством I/O.
"""
import ipaddress
import geoip2.database
import geoip2.errors

_GEOIP_DB_PATH = "/app/geoip/dbip-country-lite.mmdb"
_reader: geoip2.database.Reader | None = None


def _get_reader() -> geoip2.database.Reader:
    global _reader
    if _reader is None:
        _reader = geoip2.database.Reader(_GEOIP_DB_PATH)
    return _reader


def country_code_for_ip(ip: str) -> str | None:
    """ISO-3166-alpha2 код страны для IP, или None если определить не удалось
    (приватный/локальный IP, битый формат, IP вне покрытия базы). None — это
    осознанно "не удалось определить", вызывающий код сам решает, как
    трактовать неопределённость (см. is_russian_ip: fail-open, не fail-closed —
    ложная блокировка легитимного пользователя хуже, чем случайный пропуск)."""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return None
    except ValueError:
        return None
    try:
        response = _get_reader().country(ip)
        return response.country.iso_code
    except geoip2.errors.AddressNotFoundError:
        return None
    except Exception as e:
        print(f"[geoip] country_code_for_ip не удался для {ip}: {type(e).__name__}: {e}", flush=True)
        return None


def is_russian_ip(ip: str) -> bool:
    """True только при УВЕРЕННОМ определении 'RU'. Неопределённость (None)
    трактуется как "не Россия" (fail-open) — сознательный выбор: при сбое
    геобазы или неизвестном IP лучше по ошибке показать кнопку Google
    легитимному пользователю не из РФ, чем по ошибке спрятать её от кого-то,
    кто имеет полное право её видеть."""
    return country_code_for_ip(ip) == "RU"
