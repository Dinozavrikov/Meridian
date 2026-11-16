"""Чистка блобов снимков: файлы в CHECKPOINT_BLOB_DIR, на которые не ссылается ни один элемент снимка
(удалили лабу — каскад стёр строки, а файлы остались) и недописанные .tmp-*. Раз в сутки, как
attachment_gc.

Защита от гонки со снимком, который пишется прямо сейчас (блобы копируются ДО коммита строк): трогаются
только файлы старше BLOB_GC_GRACE_HOURS, а store_blob обновляет mtime уже существующего блоба, на
который ссылается новый снимок. Остаётся окно в доли миллисекунды между проверкой mtime и удалением —
для суточной задачи на нынешнем масштабе принято."""
import os
import time

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.checkpoints import LabCheckpointItem
from app.services import lab_checkpoints

BLOB_GC_GRACE_HOURS = 24


async def run_checkpoint_blob_gc() -> int:
    """Возвращает число удалённых файлов. Каталог читается в момент вызова (тесты подменяют его)."""
    root = lab_checkpoints.CHECKPOINT_BLOB_DIR
    if not os.path.isdir(root):
        return 0
    async with AsyncSessionLocal() as db:
        referenced = set((await db.execute(
            select(LabCheckpointItem.blob_sha256).where(LabCheckpointItem.blob_sha256.is_not(None)).distinct()
        )).scalars().all())
    cutoff = time.time() - BLOB_GC_GRACE_HOURS * 3600
    removed = 0
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            path = os.path.join(dirpath, name)
            try:
                if os.path.getmtime(path) > cutoff:
                    continue
                if name.startswith(".tmp-") or name not in referenced:
                    os.remove(path)
                    removed += 1
            except OSError:
                continue  # исчез или недоступен — не блокируем чистку остального
    for dirpath, _dirs, _files in os.walk(root, topdown=False):
        if dirpath != root:
            try:
                os.rmdir(dirpath)   # только пустые
            except OSError:
                pass
    return removed
