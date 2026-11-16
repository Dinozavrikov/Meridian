import { api } from "@/lib/api"
import type { EntityType } from "@/lib/entity-routes"

// Контракт: backend/app/api/v1/undo.py (HistoryItem) и services/undo.py (коды UndoVerdict).
// Вердикт undoable/blocked_code считает сервер — фронт его не пересчитывает.

export const UNDO_BLOCK_CODES = [
  "not_updated_event", "malformed_event", "field_not_undoable", "prediction_closed", "scale_missing", "conflict",
  "lab_state_changed", "not_lab_member",
] as const
export type UndoBlockCode = (typeof UNDO_BLOCK_CODES)[number]

// Коды отката связей (backend/app/services/link_events.py): отдельный набор, не часть UndoVerdict.
export const LINK_BLOCK_CODES = [
  "not_author", "link_missing", "link_changed", "link_exists", "endpoint_gone", "not_link_event", "pred_closed",
] as const
export type LinkBlockCode = (typeof LINK_BLOCK_CODES)[number]

// old/new могут отсутствовать: для malformed_event сервер отдаёт событие как есть.
export interface FieldChange { old?: unknown; new?: unknown }

export interface HistoryItem {
  id: number
  created_at: string
  actor_id: number
  changed_fields: Record<string, FieldChange>
  undoable: boolean
  blocked_code: UndoBlockCode | null
  blocked_fields: string[]
  reverted: boolean
  reverts_event_id: number | null  // событие порождено откатом указанного события (иначе null)
}

export interface LinkHistoryItem {
  id: number; created_at: string; actor_id: number
  type: "linked" | "unlinked" | "link_type_changed" | "competing_hypothesis" | "competing_unlinked" | "competing_changed" | "field_linked" | "field_unlinked" | "field_link_changed" | "share_closed" | "share_opened"
  other_type: string; other_id: number; other_title: string | null
  link_type: string | null; old: string | null; new: string | null
  undoable: boolean; blocked_code: string | null; reverted: boolean; reverts_event_id: number | null
  batch_id?: string | null  // общий у событий одного пакетного действия
}

export interface UndoResult { reverted_event_id: number; fields: string[] }

export const entityHistoryApi = {
  list: (type: EntityType, id: number, limit = 50) =>
    api.get(`/api/v1/${type}/${id}/history`, { params: { limit } }).then(r => r.data as HistoryItem[]),
  undo: (type: EntityType, id: number, eventId: number) =>
    api.post(`/api/v1/${type}/${id}/undo/${eventId}`).then(r => r.data as UndoResult),
  undoBatch: (type: EntityType, id: number, batchId: string) =>
    api.post(`/api/v1/${type}/${id}/undo/batch/${batchId}`).then(r => r.data as { batch_id: string; reverted: number }),
  linkList: (type: EntityType, id: number, limit = 50) =>
    api.get(`/api/v1/${type}/${id}/link-history`, { params: { limit } }).then(r => r.data as LinkHistoryItem[]),
}

export function isUndoBlockCode(code: unknown): code is UndoBlockCode | LinkBlockCode {
  return typeof code === "string" && ((UNDO_BLOCK_CODES as readonly string[]).includes(code) || (LINK_BLOCK_CODES as readonly string[]).includes(code))
}

/** Ключ словаря с причиной, почему событие нельзя откатить (blocked_code из истории). */
export function blockedReasonKey(code: string | null | undefined): string {
  return isUndoBlockCode(code) ? `history.blocked.${code}` : "history.blocked.unknown"
}

export interface UndoErrorInfo { key: string; fields: string[] }

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Ошибка POST .../undo/... → ключ словаря + технические имена полей для подстановки {fields}.
 *  detail бывает объектом {code, fields} (400/409), строкой (404) и массивом (422) —
 *  парсер переживает любую форму и никогда не бросает. */
export function parseUndoError(err: unknown): UndoErrorInfo {
  const e = asRecord(err)
  const response = asRecord(e?.response)
  if (!response) {
    // axios без response — запрос не дошёл до сервера. Любое другое исключение — наш баг,
    // выдавать его за «нет связи» нельзя.
    return { key: e?.isAxiosError === true ? "history.err.network" : "history.err.generic", fields: [] }
  }
  if (response.status === 404) return { key: "history.err.notFound", fields: [] }
  if (response.status === 400 || response.status === 409) {
    const detail = asRecord(asRecord(response.data)?.detail)
    if (detail && typeof detail.code === "string") {
      const fields = Array.isArray(detail.fields)
        ? detail.fields.filter((f): f is string => typeof f === "string")
        : []
      return { key: blockedReasonKey(detail.code), fields }
    }
  }
  return { key: "history.err.generic", fields: [] }
}
