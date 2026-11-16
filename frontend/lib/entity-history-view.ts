import { stripHtml } from "@/lib/strip-html"
import { STRINGS } from "@/lib/i18n/strings"
import type { HistoryItem } from "@/lib/entity-history-api"

// Чистая логика экрана истории: строки списка, подписи полей, формат значений.
// Ключ шкалы в changed_fields: "scale:<scale_id>" (backend/app/services/scale_values.py).
export const SCALE_FIELD_PREFIX = "scale:"
export const EMPTY_VALUE = "—"
const MAX_VALUE_LENGTH = 140

// В этих полях лежит HTML редактора: показываем текст без разметки (в DOM он не попадает).
const HTML_FIELDS = new Set(["text", "description", "answer", "falsification_criteria", "result_notes",
  "belief", "confirming_data", "refuting_data"])
const DATE_TIME_FIELDS = new Set(["expected_check_date", "deleted_at"])

export function hasString(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(STRINGS, key)
}

export const isScaleField = (field: string) => field.startsWith(SCALE_FIELD_PREFIX)
export const scaleIdOf = (field: string) => field.slice(SCALE_FIELD_PREFIX.length)

/** Ключ подписи колонки, если она есть в словаре. Колонки со встроенными шкалами берут название шкалы. */
export function fieldLabelKey(field: string): string | null {
  const key = `history.field.${field}`
  return hasString(key) ? key : null
}

export interface RowAction { kind: "undo" | "redo"; eventId: number }

export type HistoryRow =
  | { type: "edit"; item: HistoryItem; reverted: boolean; action: RowAction | null;
      blocked: { code: string | null; fields: string[] } | null }
  | { type: "undo-event"; item: HistoryItem; label: "undo" | "redo" }

/** Откат сам порождает правку (reverts_event_id указывает на откатанное событие). Кнопки живут
 *  только на ИСХОДНЫХ правках: «откатить», пока правка применена, и «вперёд» (redo), когда её
 *  откатили. Технически «вперёд» откатывает самое свежее событие-откат, поэтому отдельного
 *  эндпоинта нет. Сами события-откаты — строки без кнопок: «откат отката» не предлагается.
 *  У откатанной правки сервер возвращает вердикт conflict (значение уже равно «old»), поэтому
 *  причиной он не показывается: откатили — значит откатили. */
export function buildHistoryRows(items: HistoryItem[]): HistoryRow[] {
  const byId = new Map(items.map(i => [i.id, i]))
  const latestUndoer = new Map<number, HistoryItem>()
  for (const it of items) {
    const target = it.reverts_event_id
    if (target == null) continue
    const cur = latestUndoer.get(target)
    if (!cur || it.id > cur.id) latestUndoer.set(target, it)
  }
  return items.map((item): HistoryRow => {
    if (item.reverts_event_id != null) {
      const target = byId.get(item.reverts_event_id)
      return { type: "undo-event", item, label: target?.reverts_event_id != null ? "redo" : "undo" }
    }
    const undoer = latestUndoer.get(item.id)
    if (undoer?.undoable) {
      return { type: "edit", item, reverted: true, action: { kind: "redo", eventId: undoer.id }, blocked: null }
    }
    if (item.undoable) {
      return { type: "edit", item, reverted: false, action: { kind: "undo", eventId: item.id }, blocked: null }
    }
    if (item.reverted || undoer) {
      return { type: "edit", item, reverted: true, action: null, blocked: null }
    }
    return { type: "edit", item, reverted: false, action: null, blocked: { code: item.blocked_code, fields: item.blocked_fields } }
  })
}

export interface ValueEnv {
  yes: string
  no: string
  /** Дата-время со смещением ("…+00:00") → штамп на языке интерфейса. */
  stamp: (raw: string) => string | undefined
  /** Системные слова (status, priority, visibility) → перевод. */
  word: (field: string, raw: string) => string
  /** id лаборатории → её название (lab_id в событии смены видимости); без него показывается число. */
  lab?: (id: number) => string
}

function clip(s: string): string {
  return s.length > MAX_VALUE_LENGTH ? `${s.slice(0, MAX_VALUE_LENGTH - 1)}…` : s
}

export function formatHistoryValue(field: string, value: unknown, env: ValueEnv): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE
  if (typeof value === "boolean") return value ? env.yes : env.no
  if (typeof value === "number") return field === "lab_id" && env.lab ? env.lab(value) : String(value)
  if (typeof value === "string") {
    if (DATE_TIME_FIELDS.has(field)) return env.stamp(value) ?? value
    if (HTML_FIELDS.has(field)) return clip(stripHtml(value).replace(/\s+/g, " ").trim()) || EMPTY_VALUE
    return clip(env.word(field, value))
  }
  return clip(JSON.stringify(value) ?? EMPTY_VALUE)
}

/** Строки status/priority из событий — для useDynamicTranslate. */
export function wordValues(items: HistoryItem[]): string[] {
  const out = new Set<string>()
  for (const item of items) {
    for (const field of ["status", "priority"]) {
      const ch = item.changed_fields[field]
      for (const v of [ch?.old, ch?.new]) if (typeof v === "string" && v) out.add(v)
    }
  }
  return [...out]
}
