from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import os
from app.core.config import settings
from app.services.ai import AIUnavailable
from app.api.v1 import scales, auth, observations, hypotheses, predictions, worldview, questions, tasks, graph, stats, search, labs, feed, sources, all_sources, comments, users, messages, global_graph, presence, i18n, images, attachments, contradictions, results, entity_stage, entity_visibility, entity_competing, entity_field_link, link_batch, entity_preview, undo, lab_checkpoints, maturity_model, privacy_facts

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Схема БД теперь полностью управляется Alembic-миграциями
    # (см. entrypoint.sh — `alembic upgrade head` выполняется перед стартом
    # uvicorn). Base.metadata.create_all() отсюда убран: раньше это был
    # второй источник истины по схеме — новая таблица могла тихо
    # появиться при рестарте контейнера без соответствующей миграции.
    from app.services.prediction_reminders import send_due_prediction_reminders
    from app.services.contradiction_recheck import run_delayed_recheck
    from app.services.attachment_gc import run_attachment_gc, run_attachment_version_gc
    from app.services.checkpoint_gc import run_checkpoint_blob_gc
    # next_run_time сдвинут на +hours от старта: без этого APScheduler
    # запускает первую итерацию IntervalTrigger немедленно при каждом
    # рестарте бэкенда — при дневном деплое это означало бы мгновенную
    # рассылку писем-напоминаний по уже просроченным прогнозам, а не
    # ожидание штатного 24-часового цикла.
    first_run = datetime.now(timezone.utc) + timedelta(hours=24)
    scheduler.add_job(send_due_prediction_reminders, "interval", hours=24, id="prediction_reminders", next_run_time=first_run, max_instances=1, coalesce=True)
    scheduler.add_job(run_delayed_recheck, "interval", hours=24, id="contradiction_recheck", next_run_time=first_run, max_instances=1, coalesce=True)
    scheduler.add_job(run_attachment_gc, "interval", hours=24, id="attachment_gc", next_run_time=first_run, max_instances=1, coalesce=True)
    scheduler.add_job(run_attachment_version_gc, "interval", hours=24, id="attachment_version_gc", next_run_time=first_run, max_instances=1, coalesce=True)
    scheduler.add_job(run_checkpoint_blob_gc, "interval", hours=24, id="checkpoint_blob_gc", next_run_time=first_run, max_instances=1, coalesce=True)
    scheduler.start()
    # После смены модели эмбеддингов старые векторы не участвуют в поиске — покажем это в логе при старте.
    from app.services.embeddings import log_stale_embeddings
    await log_stale_embeddings()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="Meridian API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

@app.exception_handler(AIUnavailable)
async def _ai_unavailable_handler(request, exc):
    """Любой эндпоинт, где ИИ не ответил: 503 с понятным текстом. Текст исходной ошибки клиенту не уходит."""
    return JSONResponse(status_code=503, content={"detail": AIUnavailable.USER_MESSAGE})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.v1 import trash

for router in [
    auth.router,
    trash.router,
    scales.router,
    observations.router,
    hypotheses.router,
    predictions.router,
    worldview.router,
    questions.router,
    tasks.router,
    graph.router,
    stats.router,
    search.router,
    labs.router,
    feed.router,
    sources.router,
    images.router,
    attachments.router,
    all_sources.router,
    comments.router,
    users.router,
    messages.router,
    global_graph.router,
    presence.router,
    i18n.router,
    contradictions.router,
    results.router,
    entity_stage.router,
    entity_visibility.router,
    entity_competing.router,
    entity_field_link.router,
    link_batch.router,
    entity_preview.router,
    undo.router,
    lab_checkpoints.router,
    maturity_model.router,
    privacy_facts.router,
]:
    app.include_router(router, prefix="/api/v1")


os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/entity_images", exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}



