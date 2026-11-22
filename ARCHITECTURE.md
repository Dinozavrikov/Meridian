# Meridian — Architecture

> **Status:** living document, last reviewed 2026-11-22.
> **Scope:** how Meridian is put together — components, responsibilities, invariants, tradeoffs.
> **Out of scope:** per-endpoint API reference (FastAPI serves it at `/api/docs`), prompt engineering (see `backend/docs/LLM_ROUTING.md`), backup procedures (see `backend/docs/BACKUP.md`), access policy rules (see `backend/docs/ACCESS_POLICY.md`), changelog (see `CHANGELOG.md`).
> **How to keep this accurate:** see §15.

## Table of contents

1. Purpose and scope
2. System overview
3. Backend
4. Data model
5. Frontend
6. Cross-cutting invariants
7. Failure modes
8. Deployment
9. Testing philosophy
10. Design tradeoffs
11. Known limitations
12. Contributor recipes
13. Open questions / future work
14. References
15. Keeping this document accurate

---
## 1. Purpose and scope

Meridian is a self-hosted web application for checking ideas. Users record observations, form hypotheses, make predictions, hold beliefs, ask questions, and define tasks — all connected in a graph. Shared workspaces called *laboratories* let a group test an idea together, with forecast calibration and a local LLM for translation, classification, embeddings, and image description.

The product is pre-1.0 (the version lives in `frontend/package.json` and is bumped by `scripts/release.sh`). The data model, API, and interface may change. Laboratories are not finished.

**What this document covers.** Components, responsibilities, data flow, invariants that must hold when the code changes, and design tradeoffs that look odd from the outside but are deliberate.

**What it does not cover.** Line-by-line behavior (read the code; every complex module has a Russian docstring explaining *why*). LLM prompt details (see `LLM_ROUTING.md`). Access-policy rules (see `ACCESS_POLICY.md`). Backup and restore (see `BACKUP.md`). Event-log and cascade-cleanup details (see `EVENT_LOG_AND_CLEANUP.md`). Laboratory checkpoints (see `LAB_CHECKPOINTS.md`).
## 2. System overview

### 2.1 Context

~~~mermaid
flowchart LR
  U[User] -->|HTTPS| P[Caddy reverse proxy]
  P -->|/api/*| B[Backend: FastAPI]
  P -->|/*| F[Frontend: Next.js]
  B -->|SQL| DB[(PostgreSQL + pgvector)]
  B -->|cache / queues| R[(Redis)]
  B -->|HTTP| O[Ollama on host]
  B -->|SMTP| M[SMTP relay]
  B -->|HTTPS| T[Cloudflare Turnstile]
  B -->|HTTPS| G[Google OAuth optional]
  B -->|HTTPS| D[DB-IP geo database optional]
~~~
### 2.2 Container topology

| Container | Role | Built from | Depends on |
|---|---|---|---|
| `postgres` | PostgreSQL 16 + pgvector | `pgvector/pgvector@sha256:ccc6e83d…` | — |
| `redis` | Cache, recheck queue, presence | `redis:7-alpine` | — |
| `backend` | FastAPI app (uvicorn) | `./backend` | postgres, redis, mailpit |
| `frontend` | Next.js (SSR + client) | `./frontend` | backend |
| `recheck-worker` | Background worker: Redis queue, session purge | `./backend` | postgres, redis |
| `mailpit` | Local email catcher; the backend depends on it, so the production overlay starts it too and it delivers nothing (see README) | `axllent/mailpit` | — |
| `backend-test` | Test runner for pytest (dev only) | `./backend` | postgres-test, redis |
| `postgres-test` | Test database (dev only) | same image as prod | — |
| `caddy` | HTTPS reverse proxy (production overlay) | `caddy:2-alpine` | backend, frontend |

`backend` and `recheck-worker` share the same image but different commands (`uvicorn app.main:app` vs `python -m app.services.recheck_worker`). `backend-test` is the same image with `sleep infinity` and mounted sources.

---
## 3. Backend

### 3.1 Layers and entry points

~~~text
app/main.py              — FastAPI app, lifespan, router registration
app/api/v1/*.py          — routers, one per domain area
app/core/*.py            — config, deps, security, access policy, i18n, registries
app/services/*.py        — domain services, background jobs, LLM, files, event log
app/models/*.py          — SQLAlchemy ORM
app/db/*.py              — engine, session, redis
app/schemas/*.py         — Pydantic
app/main.py::lifespan    — APScheduler setup, config warnings, stale-embedding log
~~~

Every router is mounted under `/api/v1`. FastAPI docs at `/api/docs`. `/api/health` returns hardcoded `{"status": "ok", "version": "1.0.0"}` — see §11.

### 3.2 Configuration and startup

`pydantic-settings`, `.env`, `core/config.py`. Two-tier validation:
- **Errors** stop the process at import time (e.g., placeholder `SECRET_KEY` in production). Runs before Alembic.
- **Warnings** printed once from `lifespan` (e.g., empty `TURNSTILE_SECRET_KEY`, `SMTP_HOST=mailpit`).

`backend/entrypoint.sh` runs `python -m scripts.migrate_with_lock` before `uvicorn`. `migrate_with_lock.py` takes a PostgreSQL advisory lock (`pg_advisory_lock(727271001)`), preventing replica races.
### 3.3 Sessions and event log

`AsyncSessionLocal` uses `sync_session_class=AppSession` — the only class that emits `Event` rows. See §6 invariant 1.

**Event log mechanism.** `services/event_log.py` uses `@event.listens_for(AppSession, "before_flush")`.
- `created` rows written manually in routers via `emit_event()`.
- `updated` and `deleted` captured automatically. Per-model `_EXCLUDED_FIELDS` skips cache fields.
- `status_changed` manually emitted and **deliberately duplicated** in `updated` (§10).

**Cascade cleanup.** `deleted` events trigger cleanup of `POLYMORPHIC_CHILD_MODELS`, `Link`, `EntityHypothesis`, `RecordShare`, `EntityMention`, and files. Files collected in `session.info["_pending_file_cleanup"]`, removed in `after_commit`, cleared in `after_rollback` (invariant 5).

**actor_id.** Set via `session.info["actor_id"] = user.id` in `deps.py`. Fallback: system user. Raises `RuntimeError` if missing.

### 3.4 Access model

`core/lab_access.py` — rules documented in `backend/docs/ACCESS_POLICY.md`. Summary:
- **VIEW** — Owner OR lab member OR `public`. Guests — only `public`. Default `403`; `hide_as_404` only in `comments.py`.
- **LINK** — `can_link` = `get_entity_for_view`. Linking is deliberate publication.
- **LAB MANAGE** — Organizational ops only (hypotheses, scales). Content is owner-only.
- **CONTRIBUTE** — *deliberately absent*.
- **`opened_via_link_condition`** — Private record readable via link only with explicit consent (`RecordShare`), one step deep, never to guests.
- **Frozen visibility** — Closed predictions cannot change lab/visibility (`ensure_prediction_visibility_not_frozen`).

**Publication consent.** `require_publication_consent` returns `409 needs_consent`; client retries with `share=me|lab|public`. `revoke_shares` on link delete. `reset_shares_on_visibility_change` clears consents.

**Guest access.** `frontend/lib/guest-access.ts::GUEST_ALLOWED` is the single source of truth. `providers.tsx` opens `AuthGateModal` on 403 if no user.
### 3.5 Files

Two pipelines.
- **Images (`EntityImage`)**: `uploads/`, mounted at `/api/uploads`. Access by `_require_view`.
- **Attachments (`EntityAttachment`)**: `attachments/`, **outside** static. Served only via authenticated endpoints. Type determined by whitelist + magic bytes/zip/UTF-8. `Content-Type` ignored. HTML/SVG/XML/exec rejected. Name is `uuid4().hex + ext`. `resolve_attachment_path` defends against traversal. Limits: 10 MB / 256 KB inline. Soft delete; physical in `attachment_gc` after 180 days.

### 3.6 Soft delete, trash, undo

`SoftDeleteMixin` on 6 first-class entities. `Result` exception (§11). Trash unbounded; physical delete via `purge_entity` (`_PRE_PURGE_HOOKS` for `prediction`). `soft_deleted`/`restored` events explicitly emitted.

`POST /undo/.../undo/{event_id}` reverts a field. Owner-only. `reverts_event_id` marks "undo of undo".

### 3.7 Internationalization

- `UIStringTranslation` (public).
- `ContentTranslation` (encrypted via `EncryptedText`), keyed by `(type, id, field, lang)`.

Server: `/i18n/ensure` and `/i18n/ensure-content`. Whitelist `_ROWS` in `translatable_fields.py`. `ensure_ui_translations` is the shared core of the endpoint and of `scripts/warm_i18n.py`. A guest gets ready translations from the cache only and never makes the model work, except for the strings in `AUTH_UI_STRINGS`, which are rate-limited in memory. A new language is therefore filled by a signed-in user or by the warm-up script, not by guests.

Frontend: `lib/i18n/` with `chunked-loader`, `useT`, `useContentT`, `useDynamicT`. The loader sends strings in sequential batches: keys the screen already asked for through `useT` go first, and a batch is capped by text volume (`CHUNK_MAX_CHARS`) because the reverse proxy cuts a request after a minute. `translationScope: "content"` is placeholder.

Record text with links is translated as the field `preview_html`. `services/html_translate.py` replaces every tag with a numbered marker before the model sees the text and puts the tags back from the original afterwards, so an address can never be changed by the translation. If a marker is lost, duplicated or the model adds markup of its own, the translation falls back to plain text without links. The translation mode is kept in the browser (`restoreTranslationScope` in `store.ts`). `useT` does not read it, so the interface follows the language alone, and only the content hook honors the mode. Statuses stored with the letter yo are shown without it through `useDynamicT` with the option `noYo`.
### 3.8 AI / LLM routing

`llm_router.py` routes 5 tasks (`translate`, `analysis`, `reflection`, `vision`, `embedding`) with budget-aware truncation (`_water_fill`, `fit_texts`).

`ai.py` does business logic. `_call_llm` uses lanes. `AIUnavailable` → global `503`.

Local Ollama only. Without it, app runs, AI features unavailable.

### 3.9 Background tasks

1. **APScheduler in-process** (5 jobs, `+24h` initial, `coalesce=True`): reminders, recheck enqueue, attachment GC, version GC, checkpoint blob GC.
2. **`recheck-worker`**: Redis `BLPOP` on `recheck:queue`, 60s timeout, daily `purge_dead_sessions`, SIGTERM handling.

### 3.10 Database migrations

Alembic. `migrate_with_lock.py` wraps `alembic upgrade head` in advisory lock. `create_all()` deliberately removed.

### 3.11 Client address

`core/client_ip.py::client_ip` is the only place that reads the client address: country checks, sign-in session records and the guest rate limit all use it. It trusts `X-Real-IP`, so the proxy must overwrite that header with the client address, and the backend port must not be reachable around the proxy. Reading the connection address directly would give the address of the proxy for every client.

### 3.12 Feed previews

Feed cards carry a preview of the record text, which is HTML from the editor. `services/html_truncate.py::truncate_html` cuts it by visible text, not by characters of markup, so a link is never lost to a cut inside a tag and a long address does not eat the budget. The full text is sent only for a single record page.

---
## 4. Data model

### 4.1 First-class entities
Six types with `TimestampMixin` and `SoftDeleteMixin`: `Observation`, `Hypothesis`, `Prediction`, `Worldview`, `Question`, `ResearchTask`. `Result` is separate: it has no `SoftDeleteMixin` and is not first-class in the event log or graph (§11).

Shared: `id`, `user_id`, `visibility`, `lab_id`. Slugs use `UniqueConstraint` + `soft_delete_index`.

`Observation.importance` nullable (`None ≠ 0`). `Hypothesis.evidence_signal` (surprisal), `evidence_diversity_cache` (JSONB). `Prediction.confidence`, `signal_contribution`, `lab_signal_contribution`.

### 4.2 Graph
Single `Link` table with `from_type/from_id/to_type/to_id`, `link_type`.

### 4.3 Polymorphic children
`EntityTag`, `EntityImage`, `EntityAttachment`, `SourceDocument`, `EntityEmbedding`, `EntityStage`, `EntityComment`, `UserCommentSeen`, `EntityReflection`, `EntityReflectionInsight`, `ScaleValue`, `ContentTranslation`. Cleanup via `POLYMORPHIC_CHILD_MODELS`.

### 4.4 Audit, versions, checkpoints
`Event`, `Session`, `EntityAttachmentVersion`, `LabCheckpoint`/`LabCheckpointItem`, `RecordShare`.
## 5. Frontend

### 5.1 Routing
Next.js 16 App Router. `(app)` and `(auth)`. `GUEST_ALLOWED` and `PRERENDERED_PATHS` in `guest-access.ts`.

### 5.2 State
Zustand (`store.ts`): user, locale, translations, authGate. TanStack Query: `staleTime: 30s`, `retry: 1`.

### 5.3 API client
`api.ts` — axios, `withCredentials: true`. 409 `needs_consent` → `askConsent`; 401 → refresh, redirect only if not guest path.

### 5.4 i18n
See §3.7.

### 5.5 Components
`entities/`, `ui/`, `labs/`, `layout/`, `feed/`, etc. under `frontend/components/`.

### 5.6 Guard tests
`*.guard.test.ts` — no hardcoded ru, no native alerts, no trackers, etc. `html-sinks.test.ts` allows `dangerouslySetInnerHTML` only with sanitized HTML (`sanitizeHtml`, `renderableHtml`) or `safeJsonLd`.

### 5.7 Search and sharing

- The language is not part of the URL: interface language and content language are switched independently, and a record has one canonical address.
- Public pages with server text are listed in `PRERENDERED_PATHS` (`guest-access.ts`). `sitemap.ts` lists exactly those plus public records from `/feed/public/sitemap`. Client-only lists, sign-in pages and pages closed in `robots.ts` are not listed.
- The discussion page is split in two: `page.tsx` is a server component that fetches the record group with `fetchEntityGroup` and passes it to `discussion-client.tsx` as initial data, so the record text is in the server HTML. The data is anonymous, so it is marked stale and refetched with the rights of the person. A record the guest cannot see gives `null`, and the client loads it itself.
- `generateMetadata` in the discussion layout builds the title, description and OpenGraph from the record. Only a public record is indexable, and the author is never put into metadata. `articleJsonLd` builds the structured data and `safeJsonLd` is the only serializer allowed inside a script tag.
- Section pages use `pageMetadata`: title, description, canonical address and share tags come from one place. The share image of a record is `opengraph-image.tsx` next to the discussion page and draws text only for a public record. The site image is `app/opengraph-image.tsx`. Fonts are read from `assets/fonts` through `ogFonts`, because a `fetch` of a file address does not work in the server runtime.
- Link text inside feed cards appears after mount. The server has no DOM and cleans HTML differently, so the first render is plain text (`useSyncExternalStore` with a server value) and the markup of the server and the browser stay equal.

---
## 6. Cross-cutting invariants

1. **Event log via `AppSession` only** — Bare `Session` loses audit silently.
2. **Polymorphic children in `POLYMORPHIC_CHILD_MODELS`** — Orphans on hard delete otherwise.
3. **New `Text` columns in `text_fields.py`** — `RICH` or `PLAIN`.
4. **New translatable fields in `_ROWS`** — Guard test ensures sync.
5. **Files removed after `after_commit`** — Prevents orphaned files on rollback.
6. **Version bumped by `release.sh` only** — Does not touch `main.py` (see §11).
7. **Feed event types in `FEED_EVENT_TYPES`** — Feed reads only from `events`.
8. **New entities via `entity_registry.py`** — Avoid 3rd copy of `_ENTITY_MODELS`.
9. **`Result` not first-class** — Not in `ENTITY_MODELS`. Cleanup in router, not event log.
10. **Closed predictions frozen** — `ensure_prediction_visibility_not_frozen`.

---
## 7. Failure modes

| Failure | Handling |
|---|---|
| Ollama down | 503, app runs |
| Redis down | Silent degradation |
| PostgreSQL down | 500 |
| Turnstile down | **Fail-closed** (sign-up blocked) |
| GeoIP missing | **Fail-open** (country unknown) |
| Wrong encryption key | **Silent ciphertext** (§11) |
| System user missing | `RuntimeError` |
| Migration fails | `set -e` in entrypoint |
| Caddy restart | `lb_try_duration 20s` retries |

## 8. Deployment

Production: `docker-compose.prod.yml` + `Caddyfile`. HTTPS, `max_size 20MB`, `/api/*` → backend, `X-Real-IP` overwritten. The backend reads the client address only through `core/client_ip.py`, so any other proxy must overwrite this header too, and the backend port must not be reachable around the proxy.

Backups: `scripts/backup/` with age-encryption. You supply your own age public key; none ships with the repository.

## 9. Testing philosophy

- **Backend**: pytest + real PostgreSQL + real Ollama.
- **Frontend**: vitest + Playwright.
- **Infra**: bash scripts in `scripts/`. **No GitHub Actions**.
- **Routes**: tests walk the routes through `iter_api_routes` (`tests/route_utils.py`), because FastAPI wraps included routers.

## 10. Design tradeoffs

1. `status_changed` duplicated in `updated`.
2. Event log opt-in via `AppSession`.
3. APScheduler in-process (duplicates on scale).
4. "Opened via link" one step deep.
5. Publication consent required (409).
6. `reset_shares` clears all consents.
7. `Result` without soft-delete (hard delete only for draft).
8. `EncryptedText` at app layer (no server compromise protection).
9. No refresh-token rotation (30-day session).
10. Turnstile fail-closed, GeoIP fail-open.
11. `release.sh` doesn't touch the API version reported by `/api/health`.

## 11. Known limitations

- **No CI** (manual bash tests).
- **No app-level rate limit** for login (only Turnstile under Caddy).
- **`/i18n/ensure` rate limit in-memory**.
- **`EncryptedText` returns ciphertext** silently.
- **`_generate_username_from_email` race condition** (500 instead of friendly error).
- **`translationScope: "content"` is a placeholder**: only the content hook reads the scope, the interface follows the language alone.
- **`/api/health` reports a hardcoded version `1.0.0`**, unrelated to the product version.
- **`API_BASE_URL` default `localhost:8000`**.
- **`Result` outside event log.** `DELETE` uses `db.delete(res)`. Cascade doesn't run (`Result` not in `ENTITY_MODELS`). `EntityMention` cleanup expected by test but not visible. Needs attention.
- **`_ENTITY_MODELS` duplicated** in `recheck_worker.py` and `contradiction_recheck.py`.
- **`print()` instead of `logger`** in workers.
- **Translation of record text with links is best effort**: when the model loses a marker, the translation keeps the text and drops the links.

---
## 12. Contributor recipes

**12.1 Add first-class entity type:** model, migration, `ENTITY_MODELS`, `_ROWS`, `text_fields.py`, `_EXCLUDED_FIELDS`, cascade branch, router, `include_router`, `ENTITY_ROUTES`, API client, test.

**12.2 Add polymorphic child:** model, migration, `POLYMORPHIC_CHILD_MODELS`, file cleanup if needed, test.

**12.3 Add translatable field:** `_ROWS`, `useContentT`, guard test.

**12.4 Add `Text` column:** `text_fields.py`, guard test.

**12.5 Add feed event:** `emit_event`, `FEED_EVENT_TYPES`.

## 13. Open questions

- Refresh-token rotation.
- Lab federation.
- `recheck_worker` scaling.
- `_ENTITY_MODELS` deduplication.
- `EncryptedText` observability.
- CI.

## 14. References

**Repo:** `README.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE`, `backend/docs/*`.
**External:** FastAPI, SQLAlchemy, Alembic, PostgreSQL + pgvector, Redis, Next.js 16, React 19, Tailwind 4, Ollama, Turnstile.

## 15. Keeping this document accurate

- Update §6 on invariant changes.
- Update §10 on new tradeoffs.
- Update §11 on new limitations.
- Do not duplicate companion docs.
