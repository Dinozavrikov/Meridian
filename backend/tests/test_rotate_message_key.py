"""Ротация MESSAGE_ENCRYPTION_KEY (scripts/rotate_message_key.py). Логика проверяется на
временной таблице внутри транзакции (откатывается) — не зависит от схемы Message/ContentTranslation;
набор реальных зашифрованных колонок фиксирует отдельный тест. Соединение открывается внутри
теста, а не async-фикстурой: фикстура жила в другом event loop, чем тест, и asyncpg падал."""
from contextlib import asynccontextmanager

import pytest
import sqlalchemy as sa
from cryptography.fernet import Fernet, InvalidToken

from app.core.encrypted_field import EncryptedText
from app.db.session import AsyncSessionLocal
from app.models.i18n import ContentTranslation
from app.models.social import Message
from scripts import rotate_message_key as rmk

_SCRATCH = sa.Table("zz_rotate_scratch", sa.MetaData(),
                    sa.Column("id", sa.Integer, primary_key=True), sa.Column("body", sa.Text))


def _keys():
    return Fernet(Fernet.generate_key()), Fernet(Fernet.generate_key())


def _enc(f: Fernet, s: str) -> str:
    return f.encrypt(s.encode("utf-8")).decode("ascii")


@asynccontextmanager
async def _conn():
    async with AsyncSessionLocal() as s:
        c = await s.connection()
        await c.run_sync(_SCRATCH.metadata.create_all)
        try:
            yield c
        finally:
            await s.rollback()


async def _put(c, rows: dict):
    await c.execute(sa.text("INSERT INTO zz_rotate_scratch (id, body) VALUES (:i, :b)"),
                    [{"i": i, "b": b} for i, b in rows.items()])


async def _raw(c) -> dict:
    return {r[0]: r[1] for r in
            (await c.execute(sa.text("SELECT id, body FROM zz_rotate_scratch ORDER BY id"))).fetchall()}


# ── форма значения: токен vs открытый текст ──────────────────────────────────

def test_fernet_token_looks_like_token():
    f = Fernet(Fernet.generate_key())
    assert rmk._looks_like_fernet_token(f.encrypt(b"x"))


@pytest.mark.parametrize("value", [b"plain ascii text", b"not-base64-!!!", b"", b"short"])
def test_arbitrary_ascii_does_not_look_like_token(value):
    assert not rmk._looks_like_fernet_token(value)


def test_rotate_value_statuses():
    old, new = _keys()
    status, value = rmk.rotate_value(old, new, _enc(old, "привет"))
    assert status == "rotated" and new.decrypt(value.encode()) == "привет".encode()
    with pytest.raises(InvalidToken):
        old.decrypt(value.encode())

    token_new = _enc(new, "x")
    assert rmk.rotate_value(old, new, token_new) == ("already_new", token_new)


def test_rotate_value_encrypts_plaintext_in_place():
    old, new = _keys()
    # ASCII, не похожий на токен по форме — легаси-кэш, записанный до включения шифрования.
    status, value = rmk.rotate_value(old, new, "plain ascii legacy")
    assert status == "encrypted_plaintext"
    assert new.decrypt(value.encode()) == b"plain ascii legacy"

    # не-ASCII заведомо не может быть Fernet-токеном — тоже открытый текст, тот же путь.
    status, value = rmk.rotate_value(old, new, "открытый текст")
    assert status == "encrypted_plaintext"
    assert new.decrypt(value.encode()) == "открытый текст".encode("utf-8")


@pytest.mark.asyncio
async def test_rotate_column_rotates_and_is_idempotent():
    old, new = _keys()
    async with _conn() as conn:
        await _put(conn, {1: _enc(old, "привет"), 2: _enc(old, "hello"), 3: _enc(new, "already")})
        counts = await rmk.rotate_column(conn, _SCRATCH, "body", old, new)
        assert counts == {"rotated": 2, "already_new": 1, "encrypted_plaintext": 0, "undecryptable": 0}
        raw = await _raw(conn)
        assert new.decrypt(raw[1].encode()) == "привет".encode()
        with pytest.raises(InvalidToken):
            old.decrypt(raw[1].encode())
        again = await rmk.rotate_column(conn, _SCRATCH, "body", old, new)
        assert again == {"rotated": 0, "already_new": 3, "encrypted_plaintext": 0, "undecryptable": 0}


@pytest.mark.asyncio
async def test_plaintext_is_encrypted_but_foreign_key_token_aborts():
    """Ядро логики B: открытый текст (кэш до шифрования) безопасно шифруется на месте; значение,
    похожее на токен, но зашифрованное третьим (неизвестным) ключом — останавливает ротацию, а не
    перешифровывается вслепую (иначе исходные данные были бы потеряны необратимо)."""
    old, new = _keys()
    third = Fernet(Fernet.generate_key())  # имитирует «не тот ключ» — токен, но никому здесь не известный
    third_token = _enc(third, "other")  # сохраняем сам токен — Fernet.encrypt недетерминирован
                                         # (случайный IV/nonce), повторный _enc(...) дал бы другую строку
    async with _conn() as conn:
        await _put(conn, {1: _enc(old, "secret"), 2: third_token, 3: "legacy текст"})
        before = await _raw(conn)

        with pytest.raises(rmk.UndecryptableRows):
            await rmk.rotate_column(conn, _SCRATCH, "body", old, new)
        assert await _raw(conn) == before  # abort ДО любых записей — даже безопасная строка 3 не тронута

        counts = await rmk.rotate_column(conn, _SCRATCH, "body", old, new, on_undecryptable="skip")
        assert counts == {"rotated": 1, "already_new": 0, "encrypted_plaintext": 1, "undecryptable": 1}
        raw = await _raw(conn)
        assert new.decrypt(raw[1].encode()) == b"secret"
        assert raw[2] == third_token  # чужой токен пропущен нетронутым, не потерян
        assert new.decrypt(raw[3].encode()) == "legacy текст".encode("utf-8")


@pytest.mark.asyncio
async def test_verify_column_counts():
    _, new = _keys()
    async with _conn() as conn:
        await _put(conn, {1: _enc(new, "ok"), 2: "plain"})
        assert await rmk.verify_column(conn, _SCRATCH, "body", new) == {"ok": 1, "undecryptable": 1}


def test_discovery_finds_exactly_the_encrypted_columns():
    """Новая EncryptedText-колонка попадёт под ротацию сама, но этот тест заставит осознанно
    обновить ожидание (и подумать, что происходит с её данными при смене ключа)."""
    expected = {(Message.__table__.name, "content"), (ContentTranslation.__table__.name, "translated_text")}
    assert {(t.name, c) for t, c in rmk.discover_encrypted_columns()} == expected


def test_generate_key_file_is_private_never_printed_never_overwritten(tmp_path, capsys):
    path = tmp_path / "new.key"
    assert rmk.main(["--generate-key-file", str(path)]) == 0
    key = path.read_text().strip()
    Fernet(key.encode())  # валидный Fernet-ключ
    assert path.stat().st_mode & 0o777 == 0o600
    out = capsys.readouterr()
    assert key not in out.out and key not in out.err
    with pytest.raises(FileExistsError):
        rmk.generate_key_file(str(path))


def test_encrypted_text_survives_legacy_plaintext():
    """Регрессия: открытый текст с не-ASCII символами раньше ронял чтение UnicodeEncodeError
    (ловился только InvalidToken)."""
    t = EncryptedText()
    assert t.process_result_value("привет", None) == "привет"
    assert t.process_result_value("plain ascii", None) == "plain ascii"
    assert t.process_result_value(t.process_bind_param("секрет", None), None) == "секрет"
