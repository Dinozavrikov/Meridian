"""Прозрачное шифрование текстовых полей на уровне SQLAlchemy-типа.

Закрывает утечку через кражу бэкапа БД / доступ к диску без доступа к
приложению — НЕ защищает от инсайдера с доступом к самому серверу (ключ
живёт в .env рядом с кодом, который расшифровывает на лету).

Применяется к Message.content и ContentTranslation.translated_text —
единообразно ко всей таблице кэша контента, без ветвления по entity_type.
"""
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import TypeDecorator, Text
from app.core.config import settings

_fernet = Fernet(settings.MESSAGE_ENCRYPTION_KEY.encode())


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return _fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return _fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeEncodeError):
            # UnicodeEncodeError: открытый текст с не-ASCII символами (Fernet-токен всегда ASCII) —
            # .encode("ascii") падает раньше, чем Fernet успевает сказать InvalidToken.
            # Не расшифровалось — до миграции данных или подставлен не тот
            # ключ. Не роняем чтение всего списка из-за одной строки.
            return value
