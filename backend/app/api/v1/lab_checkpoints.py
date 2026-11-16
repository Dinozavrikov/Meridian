"""Снимки лабы: создание (любой участник), список, просмотр, дифф, проверка целостности, скачивание
файла (участники) и публикация (owner/admin, только в публичной лабе). Не участник закрытой лабы получает
404 (факт существования не подтверждаем), не участник публичной — 403 на создание/публикацию и ТОЛЬКО
опубликованное на чтение, по белому списку полей (services/checkpoint_redaction.py)."""
import asyncio
import os
from collections import Counter
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from app.schemas._strict import StrictIn
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.labs import _resolve_lab_id
from app.core.deps import get_current_user, get_current_user_optional
from app.core.lab_access import _lab_role
from app.db.session import get_db
from app.models.checkpoints import LabCheckpoint, LabCheckpointItem
from app.models.social import Lab
from app.models.user import User
from app.services import checkpoint_redaction as redaction
from app.services import lab_checkpoints as svc
from app.services.checkpoint_diff import diff_items

router = APIRouter(prefix="/labs", tags=["lab-checkpoints"])
PUBLISH_ROLES = ("owner", "admin")


class CheckpointCreate(StrictIn):
    title: Optional[str] = None

    @field_validator("title")
    @classmethod
    def _clean_title(cls, v):
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > svc.TITLE_MAX_LEN:
            raise ValueError(f"Не длиннее {svc.TITLE_MAX_LEN} знаков")
        if any(ord(c) < 32 or ord(c) == 127 for c in v):  # NUL роняет запись в Postgres, остальное — мусор
            raise ValueError("Недопустимые управляющие символы")
        return v


class PublishIn(StrictIn):
    is_published: bool


class CheckpointOut(BaseModel):
    """Для участников."""
    id: int
    lab_id: int
    title: Optional[str]
    created_at: datetime
    created_by: Optional[int]
    created_by_username: Optional[str]
    parent_id: Optional[int]
    is_published: bool
    published_at: Optional[datetime]
    item_count: int
    blob_bytes: int
    schema_version: int
    tree_hash: str
    commit_hash: str
    storage: Optional[dict] = None   # только в ответе на создание: used_bytes / budget_bytes / warn (>=80%)


class PublicCheckpointOut(BaseModel):
    """Для посторонних: без людей, без родителя (его id выдал бы существование неопубликованных снимков),
    без размеров (по ним видно число скрытых элементов)."""
    id: int
    lab_id: int
    title: Optional[str]
    created_at: datetime
    published_at: Optional[datetime]
    schema_version: int
    commit_hash: str


def _out(cp: LabCheckpoint, username: Optional[str]) -> CheckpointOut:
    return CheckpointOut(
        id=cp.id, lab_id=cp.lab_id, title=cp.title, created_at=cp.created_at, created_by=cp.created_by,
        created_by_username=username, parent_id=cp.parent_id, is_published=cp.is_published,
        published_at=cp.published_at, item_count=cp.item_count, blob_bytes=cp.blob_bytes,
        schema_version=cp.schema_version, tree_hash=cp.tree_hash, commit_hash=cp.commit_hash,
    )


def _public_out(cp: LabCheckpoint) -> PublicCheckpointOut:
    return PublicCheckpointOut(
        id=cp.id, lab_id=cp.lab_id, title=cp.title, created_at=cp.created_at, published_at=cp.published_at,
        schema_version=cp.schema_version, commit_hash=cp.commit_hash,
    )


async def _lab_context(db: AsyncSession, lab_ref: str, user: Optional[User]):
    lab_id = await _resolve_lab_id(db, lab_ref)
    lab = await db.get(Lab, lab_id)
    if lab is None:
        raise HTTPException(404, "Лаборатория не найдена")
    role = await _lab_role(db, lab.id, user.id) if user else None
    if role is None and not lab.is_public:
        raise HTTPException(404, "Лаборатория не найдена")
    return lab, role


async def _usernames(db: AsyncSession, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return dict((await db.execute(select(User.id, User.username).where(User.id.in_(ids)))).all())


async def _member_out(db: AsyncSession, cp: LabCheckpoint) -> CheckpointOut:
    names = await _usernames(db, {cp.created_by} if cp.created_by else set())
    return _out(cp, names.get(cp.created_by))


async def _load_items(db: AsyncSession, checkpoint_id: int) -> list[LabCheckpointItem]:
    return list((await db.execute(select(LabCheckpointItem).where(LabCheckpointItem.checkpoint_id == checkpoint_id)
                                  .order_by(LabCheckpointItem.object_key))).scalars().all())


@router.post("/{lab_id}/checkpoints", response_model=CheckpointOut, status_code=201)
async def create_checkpoint(lab_id: str, body: CheckpointCreate,
                            user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab, role = await _lab_context(db, lab_id, user)
    if role is None:
        raise HTTPException(403, "Вы не участник этой лаборатории")
    try:
        cid = await svc.create_checkpoint(lab.id, user.id, body.title)
    except svc.CheckpointError as e:
        raise HTTPException(409, detail=e.detail)
    except LookupError:
        raise HTTPException(404, "Лаборатория не найдена")
    except DBAPIError as e:
        if svc.is_chain_conflict(e):
            raise HTTPException(409, detail={"code": "checkpoint_conflict"})
        raise
    out = _out(await db.get(LabCheckpoint, cid), user.username)
    out.storage = svc.storage_status(await svc.lab_storage_bytes(db, lab.id))
    return out


@router.get("/{lab_id}/checkpoints")
async def list_checkpoints(lab_id: str, user: Optional[User] = Depends(get_current_user_optional),
                           db: AsyncSession = Depends(get_db)):
    lab, role = await _lab_context(db, lab_id, user)
    stmt = select(LabCheckpoint).where(LabCheckpoint.lab_id == lab.id).order_by(LabCheckpoint.id.desc())
    if role is None:
        cps = (await db.execute(stmt.where(LabCheckpoint.is_published.is_(True)))).scalars().all()
        return [_public_out(c).model_dump(mode="json") for c in cps]
    cps = (await db.execute(stmt)).scalars().all()
    names = await _usernames(db, {c.created_by for c in cps if c.created_by})
    return [_out(c, names.get(c.created_by)).model_dump(mode="json") for c in cps]


@router.get("/{lab_id}/checkpoints/storage")
async def checkpoints_storage(lab_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сколько места заняли снимки лабы и каков потолок (только участникам): для полосы хранения в интерфейсе."""
    lab, role = await _lab_context(db, lab_id, user)
    if role is None:
        raise HTTPException(404, "Лаборатория не найдена")
    return svc.storage_status(await svc.lab_storage_bytes(db, lab.id))


# ВАЖНО: /checkpoints/storage и /checkpoints/diff объявлены ВЫШЕ /checkpoints/{cid}, иначе слово попадёт в {cid} и вернёт 422.
@router.get("/{lab_id}/checkpoints/diff")
async def diff_checkpoints(lab_id: str, frm: int = Query(..., alias="from"), to: int = Query(...),
                           user: Optional[User] = Depends(get_current_user_optional),
                           db: AsyncSession = Depends(get_db)):
    lab, role = await _lab_context(db, lab_id, user)
    a, b = await db.get(LabCheckpoint, frm), await db.get(LabCheckpoint, to)

    def visible(cp: Optional[LabCheckpoint]) -> bool:
        return cp is not None and cp.lab_id == lab.id and (role is not None or cp.is_published)

    if not (visible(a) and visible(b)):
        raise HTTPException(404, "Снимок не найден")
    records = diff_items(await _load_items(db, a.id), await _load_items(db, b.id))
    if role is None:
        records = redaction.redact_diff(records)
        meta = {"from": _public_out(a).model_dump(mode="json"), "to": _public_out(b).model_dump(mode="json")}
    else:
        meta = {"from": (await _member_out(db, a)).model_dump(mode="json"),
                "to": (await _member_out(db, b)).model_dump(mode="json")}
    return {**meta, "audience": "member" if role else "public",
            "summary": dict(Counter(r["status"] for r in records)), "records": records}


@router.get("/{lab_id}/checkpoints/{cid}")
async def view_checkpoint(lab_id: str, cid: int, user: Optional[User] = Depends(get_current_user_optional),
                          db: AsyncSession = Depends(get_db)):
    lab, role = await _lab_context(db, lab_id, user)
    cp = await db.get(LabCheckpoint, cid)
    if cp is None or cp.lab_id != lab.id or (role is None and not cp.is_published):
        raise HTTPException(404, "Снимок не найден")
    rows = await _load_items(db, cp.id)
    if role is None:
        return {"checkpoint": _public_out(cp).model_dump(mode="json"), "audience": "public",
                **svc.group_items(redaction.public_rows(rows))}
    ids = {v for it in rows for k in ("user_id", "author_id") if isinstance((v := it.snapshot_data.get(k)), int)}
    users = await _usernames(db, ids)  # текущие имена: у удалённых аккаунтов имени нет, интерфейс пишет «аккаунт удалён»
    return {"checkpoint": (await _member_out(db, cp)).model_dump(mode="json"), "audience": "member",
            "users": {str(i): n for i, n in users.items()}, **svc.group_items(rows)}


@router.get("/{lab_id}/checkpoints/{cid}/verify")
async def verify_checkpoint(lab_id: str, cid: int, files: bool = False,
                            user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Пересчёт хешей из того, что лежит в базе. files=true — ещё и наличие файлов-блобов."""
    lab, role = await _lab_context(db, lab_id, user)
    cp = await db.get(LabCheckpoint, cid)
    if role is None or cp is None or cp.lab_id != lab.id:
        raise HTTPException(404, "Снимок не найден")
    problems = await svc.verify_checkpoint(db, cp.id, check_blobs=files)
    return {"ok": not problems, "problems": problems, "commit_hash": cp.commit_hash}


@router.patch("/{lab_id}/checkpoints/{cid}/publish", response_model=CheckpointOut)
async def publish_checkpoint(lab_id: str, cid: int, body: PublishIn,
                             user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lab, role = await _lab_context(db, lab_id, user)
    if role is None:
        raise HTTPException(403, "Вы не участник этой лаборатории")
    if role not in PUBLISH_ROLES:
        raise HTTPException(403, "Публиковать снимки может только владелец или администратор лаборатории")
    cp = (await db.execute(select(LabCheckpoint).where(LabCheckpoint.id == cid, LabCheckpoint.lab_id == lab.id)
                           .with_for_update())).scalar_one_or_none()
    if cp is None:
        raise HTTPException(404, "Снимок не найден")
    if body.is_published and not cp.is_published:
        if not lab.is_public:
            raise HTTPException(409, detail={"code": "lab_not_public"})
        cp.is_published = True
        cp.published_at = await db.scalar(select(func.now()))
        cp.published_by = user.id
    elif not body.is_published and cp.is_published:
        cp.is_published = False
    await db.commit()
    return await _member_out(db, cp)


@router.get("/{lab_id}/checkpoints/{cid}/files/{item_id}")
async def download_checkpoint_file(lab_id: str, cid: int, item_id: int,
                                   user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Байты файла из снимка — только участникам. Перед отдачей хеш файла сверяется с записанным:
    подменённый или повреждённый блоб не отдаётся."""
    lab, role = await _lab_context(db, lab_id, user)
    cp = await db.get(LabCheckpoint, cid)
    it = await db.get(LabCheckpointItem, item_id)
    if (role is None or cp is None or cp.lab_id != lab.id or it is None or it.checkpoint_id != cid
            or it.kind not in svc.FILE_KINDS or not it.blob_sha256):
        raise HTTPException(404, "Файл не найден")
    path = svc.blob_path(it.blob_sha256)
    if not await asyncio.to_thread(lambda: os.path.isfile(path)):
        raise HTTPException(404, detail={"code": "blob_missing"})
    if await asyncio.to_thread(svc.sha256_file, path) != it.blob_sha256:
        raise HTTPException(409, detail={"code": "blob_corrupted"})
    return FileResponse(path, media_type="application/octet-stream", filename=svc.download_name(it),
                        headers={"X-Content-Type-Options": "nosniff"})
