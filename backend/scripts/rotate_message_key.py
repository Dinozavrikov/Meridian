"""Ротация MESSAGE_ENCRYPTION_KEY — перешифровка всех колонок EncryptedText.

Зачем: простая замена ключа в .env делает все сохранённые значения нечитаемыми (Fernet-токен
привязан к ключу). Скрипт читает каждое значение СТАРЫМ ключом (тем, что сейчас в окружении
приложения) и записывает НОВЫМ — всё в одной транзакции: перешифровано всё или ничего.

Ключи не печатаются ни в одном режиме. Новый ключ создаётся --generate-key-file прямо в файл
(права 600, существующий файл не перезаписывается) и передаётся скрипту файлом, а не переменной
окружения или аргументом: так он не попадает ни в историю шелла, ни в `ps`, ни в вывод.

Три исхода на значение:
- rotated / already_new — обычный Fernet-токен, расшифрован старым (или уже новым) ключом,
  перешифрован новым.
- encrypted_plaintext — значение НЕ ПОХОЖЕ на Fernet-токен по форме (см. _looks_like_fernet_token):
  не могло быть шифртекстом ни под каким ключом, значит это открытый текст (например, кэш,
  записанный до того, как колонка стала EncryptedText). Шифруется новым ключом на месте,
  содержимое не меняется. Это единственный безопасный способ отличить «на самом деле не
  зашифровано» от «зашифровано не тем ключом» — по факту неудачи расшифровки эти два случая
  неразличимы, а перепутать их означает один раз необратимо зашифровать поверх чужого шифртекста.
- undecryptable — ПОХОЖЕ на Fernet-токен (нужная форма), но не открывается ни старым, ни новым
  ключом. Подозрительно (вероятно, не тот старый ключ) — по умолчанию abort, ничего не пишется.
  --on-undecryptable skip оставляет такие строки как есть.

Порядок (офлайн — backend и recheck-worker остановлены, чтобы никто не писал старым ключом
во время ротации):
    1. --generate-key-file /keys/new.key
    2. без флагов                        -> dry-run: считает и проверяет, транзакция откатывается
    3. --apply --new-key-file /keys/new.key -> коммит
    4. заменить MESSAGE_ENCRYPTION_KEY в .env на содержимое файла, запустить приложение
    5. --verify                          -> каждое значение расшифровывается ключом приложения

Набор колонок определяется автоматически (все колонки типа EncryptedText в metadata): новая
зашифрованная колонка попадёт под ротацию сама; tests/test_rotate_message_key.py фиксирует
ожидаемый набор, чтобы добавление колонки было осознанным."""
import argparse
import asyncio
import base64
import binascii
import os
import sys
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


class UndecryptableRows(Exception):
    """Есть значения, похожие на Fernet-токен по форме, но не расшифровывающиеся ни
    старым, ни новым ключом (вероятно, зашифрованы не тем ключом — перешифровывать
    вслепую нельзя, это необратимо потеряло бы данные)."""

    def __init__(self, counts: dict):
        super().__init__(f"похожи на токен, но не расшифровываются: {counts}")
        self.counts = counts


def _qi(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _looks_like_fernet_token(raw: bytes) -> bool:
    """Fernet-токен — всегда base64-urlsafe с фиксированным первым байтом (версия формата,
    0x80). Строка, которая даже не декодируется как base64, или декодируется в байты с другим
    первым байтом, не могла быть шифртекстом Fernet ни под каким ключом — значит, это открытый
    текст. Практическая вероятность случайного совпадения легаси-строки с этой формой пренебрежимо
    мала (нужен конкретный первый байт после декодирования произвольного ASCII-текста)."""
    pad = b"=" * (-len(raw) % 4)
    try:
        decoded = base64.urlsafe_b64decode(raw + pad)
    except (binascii.Error, ValueError):
        return False
    return len(decoded) >= 1 and decoded[0] == 0x80


def discover_encrypted_columns() -> list:
    from app.core.encrypted_field import EncryptedText
    import app.models.entities, app.models.i18n, app.models.social, app.models.user  # noqa: F401 — наполняют metadata
    from app.models.social import Message

    found = []
    for table in Message.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, EncryptedText):
                found.append((table, col.name))
    return sorted(found, key=lambda tc: (tc[0].name, tc[1]))


def rotate_value(old: Fernet, new: Fernet, value: str):
    """(статус, новое_значение). Форма — а не только результат расшифровки — решает, что перед
    нами: см. докстринг модуля про encrypted_plaintext vs undecryptable."""
    try:
        raw = value.encode("ascii")
    except UnicodeEncodeError:
        # Не-ASCII байты в значении заведомо невозможны в валидном Fernet-токене.
        return "encrypted_plaintext", new.encrypt(value.encode("utf-8")).decode("ascii")

    if not _looks_like_fernet_token(raw):
        return "encrypted_plaintext", new.encrypt(value.encode("utf-8")).decode("ascii")

    try:
        plain = old.decrypt(raw)
    except InvalidToken:
        try:
            new.decrypt(raw)
        except InvalidToken:
            return "undecryptable", value
        return "already_new", value
    return "rotated", new.encrypt(plain).decode("ascii")


async def rotate_column(conn, table, col: str, old: Fernet, new: Fernet, *, on_undecryptable: str = "abort") -> dict:
    pk = [c.name for c in table.primary_key.columns]
    if not pk:
        raise RuntimeError(f"{table.name}: нет первичного ключа — ротация невозможна")
    sel = text(f"SELECT {', '.join(_qi(c) for c in pk + [col])} FROM {_qi(table.name)} WHERE {_qi(col)} IS NOT NULL")
    counts = {"rotated": 0, "already_new": 0, "encrypted_plaintext": 0, "undecryptable": 0}
    updates = []
    for row in (await conn.execute(sel)).fetchall():
        status, value = rotate_value(old, new, row[-1])
        counts[status] += 1
        if status in ("rotated", "encrypted_plaintext"):
            updates.append({"v": value, **{f"pk{i}": row[i] for i in range(len(pk))}})
    if counts["undecryptable"] and on_undecryptable == "abort":
        raise UndecryptableRows({f"{table.name}.{col}": counts["undecryptable"]})  # до любых записей
    if updates:
        where = " AND ".join(f"{_qi(c)} = :pk{i}" for i, c in enumerate(pk))
        await conn.execute(text(f"UPDATE {_qi(table.name)} SET {_qi(col)} = :v WHERE {where}"), updates)
    return counts


async def verify_column(conn, table, col: str, fernet: Fernet) -> dict:
    sel = text(f"SELECT {_qi(col)} FROM {_qi(table.name)} WHERE {_qi(col)} IS NOT NULL")
    counts = {"ok": 0, "undecryptable": 0}
    for (value,) in (await conn.execute(sel)).fetchall():
        try:
            fernet.decrypt(value.encode("ascii"))
        except (InvalidToken, UnicodeEncodeError):
            counts["undecryptable"] += 1
        else:
            counts["ok"] += 1
    return counts


async def rotate_all(conn, old: Fernet, new: Fernet, *, on_undecryptable: str = "abort") -> dict:
    """Вызывать внутри транзакции: при UndecryptableRows вызывающий обязан её откатить —
    предыдущие колонки к этому моменту уже обновлены."""
    result, problems = {}, {}
    for table, col in discover_encrypted_columns():
        try:
            result[f"{table.name}.{col}"] = await rotate_column(conn, table, col, old, new,
                                                                on_undecryptable=on_undecryptable)
        except UndecryptableRows as e:
            problems.update(e.counts)
    if problems:
        raise UndecryptableRows(problems)
    return result


def generate_key_file(path: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)  # не перезаписывает существующий
    with os.fdopen(fd, "w") as f:
        f.write(Fernet.generate_key().decode() + "\n")


async def _run(args) -> int:
    from app.core.config import settings

    app_key = settings.MESSAGE_ENCRYPTION_KEY.encode()
    old = Fernet(app_key)
    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            columns = discover_encrypted_columns()
            if args.verify:
                bad = 0
                for table, col in columns:
                    c = await verify_column(conn, table, col, old)
                    print(f"{table.name}.{col}: расшифровывается={c['ok']} не_расшифровывается={c['undecryptable']}")
                    bad += c["undecryptable"]
                return 0 if bad == 0 else 2

            if args.new_key_file:
                new_key = Path(args.new_key_file).read_text().strip().encode()
                if new_key == app_key:
                    print("Ошибка: новый ключ совпадает со старым — ротация бессмысленна.")
                    return 2
                new = Fernet(new_key)
            else:
                new = Fernet(Fernet.generate_key())  # dry-run: одноразовый ключ, транзакция откатывается

            trans = await conn.begin()
            try:
                counts = await rotate_all(conn, old, new, on_undecryptable=args.on_undecryptable)
                for table, col in columns:  # сверка ДО коммита: всё перешифрованное читается новым ключом
                    c = await verify_column(conn, table, col, new)
                    if c["undecryptable"] != counts[f"{table.name}.{col}"]["undecryptable"]:
                        raise RuntimeError(f"{table.name}.{col}: после ротации часть значений не читается новым ключом")
            except UndecryptableRows as e:
                await trans.rollback()
                print(f"Остановлено, ничего не записано. Похожи на токен, но не расшифровываются: {e.counts}")
                print("Варианты: проверить, тот ли старый ключ в окружении; либо --on-undecryptable skip.")
                return 2
            except BaseException:
                await trans.rollback()
                raise
            for key, c in counts.items():
                print(f"{key}: перешифровано={c['rotated']} уже_новым_ключом={c['already_new']} "
                      f"открытый_текст_зашифрован={c['encrypted_plaintext']} "
                      f"похоже_на_токен_но_не_открывается={c['undecryptable']}")
            if args.apply:
                await trans.commit()
                print("ПРИМЕНЕНО: транзакция закоммичена.")
            else:
                await trans.rollback()
                print("DRY-RUN: транзакция откачена, данные не изменены.")
            return 0
    finally:
        await engine.dispose()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Ротация MESSAGE_ENCRYPTION_KEY (см. docstring модуля)")
    p.add_argument("--generate-key-file", metavar="PATH", help="создать файл с новым ключом (права 600) и выйти")
    p.add_argument("--new-key-file", metavar="PATH", help="файл с новым ключом (для --apply)")
    p.add_argument("--apply", action="store_true", help="закоммитить (без флага — dry-run)")
    p.add_argument("--verify", action="store_true", help="проверить, что всё расшифровывается ключом приложения")
    p.add_argument("--on-undecryptable", choices=["abort", "skip"], default="abort",
                    help="только для строк, похожих на токен, но не открывающихся ни одним ключом; "
                         "открытый текст перешифровывается всегда, этот флаг на него не влияет")
    args = p.parse_args(argv)
    if args.generate_key_file:
        generate_key_file(args.generate_key_file)
        print(f"Ключ создан: {args.generate_key_file} (содержимое не выводится)")
        return 0
    if args.apply and not args.new_key_file:
        p.error("--apply требует --new-key-file")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
