import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { DEFAULT_SCALES } from "@/lib/scales"
import type { HistoryItem } from "@/lib/entity-history-api"
import {
  EMPTY_VALUE, buildHistoryRows, fieldLabelKey, formatHistoryValue, isScaleField, scaleIdOf,
  wordValues, type ValueEnv,
} from "@/lib/entity-history-view"

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 1, created_at: "2026-10-03T07:00:00Z", actor_id: 1, changed_fields: { title: { old: "A", new: "B" } },
  undoable: true, blocked_code: null, blocked_fields: [], reverted: false, reverts_event_id: null, ...over,
})

const env: ValueEnv = { yes: "да", no: "нет", stamp: raw => `stamp(${raw})`, word: (f, s) => `${f}:${s}` }

describe("buildHistoryRows", () => {
  type Rows = ReturnType<typeof buildHistoryRows>
  const edit = (rows: Rows, id: number) => {
    const row = rows.find(r => r.item.id === id)!
    if (row.type !== "edit") throw new Error(`строка ${id} — откат, а не правка`)
    return row
  }
  const undone = (over: Partial<HistoryItem> = {}) =>
    item({ undoable: false, blocked_code: "conflict", blocked_fields: ["title"], reverted: true, ...over })

  it("применённая правка: «Откатить» на ней самой", () => {
    expect(edit(buildHistoryRows([item({ id: 1 })]), 1))
      .toMatchObject({ reverted: false, action: { kind: "undo", eventId: 1 }, blocked: null })
  })

  it("откат — отдельная строка; «вперёд» на исходной правке откатывает САМ откат", () => {
    const rows = buildHistoryRows([item({ id: 2, reverts_event_id: 1 }), undone({ id: 1 })])
    expect(rows[0]).toMatchObject({ type: "undo-event", label: "undo" })
    expect(edit(rows, 1)).toMatchObject({ reverted: true, action: { kind: "redo", eventId: 2 }, blocked: null })
  })

  it("после «вперёд» исходная правка снова откатываема, второй откат подписан «возврат»", () => {
    const rows = buildHistoryRows([
      item({ id: 3, reverts_event_id: 2 }),
      undone({ id: 2, reverts_event_id: 1 }),
      item({ id: 1, reverted: true }),
    ])
    expect(rows[0]).toMatchObject({ type: "undo-event", label: "redo" })
    expect(rows[1]).toMatchObject({ type: "undo-event", label: "undo" })
    expect(edit(rows, 1)).toMatchObject({ reverted: false, action: { kind: "undo", eventId: 1 } })
  })

  it("несколько откатов одной правки: «вперёд» берёт самый свежий", () => {
    const rows = buildHistoryRows([
      item({ id: 4, reverts_event_id: 1 }),
      undone({ id: 3, reverts_event_id: 2 }),
      undone({ id: 2, reverts_event_id: 1 }),
      undone({ id: 1 }),
    ])
    expect(edit(rows, 1)).toMatchObject({ reverted: true, action: { kind: "redo", eventId: 4 } })
    expect(rows.slice(0, 3).map(r => r.type === "undo-event" && r.label)).toEqual(["undo", "redo", "undo"])
  })

  it("откачено, а значение потом правили руками: бейдж без действия и без ложного «конфликта»", () => {
    const rows = buildHistoryRows([undone({ id: 2, reverts_event_id: 1, reverted: false }), undone({ id: 1 })])
    expect(edit(rows, 1)).toMatchObject({ reverted: true, action: null, blocked: null })
  })

  it("старое событие без пометки откатов: откатанное остаётся без кнопок", () => {
    expect(edit(buildHistoryRows([undone({ id: 1 })]), 1)).toMatchObject({ reverted: true, action: null, blocked: null })
  })

  it("заблокированная правка несёт код и поля, действия нет", () => {
    const row = edit(buildHistoryRows([item({ id: 1, undoable: false, blocked_code: "field_not_undoable", blocked_fields: ["status"] })]), 1)
    expect(row).toMatchObject({ reverted: false, action: null, blocked: { code: "field_not_undoable", fields: ["status"] } })
  })
})

describe("formatHistoryValue", () => {
  it("пусто, null и undefined — прочерк, но 0 и false — настоящие значения", () => {
    for (const v of [null, undefined, ""]) expect(formatHistoryValue("title", v, env)).toBe(EMPTY_VALUE)
    expect(formatHistoryValue("importance", 0, env)).toBe("0")
    expect(formatHistoryValue("confirms_hypothesis_if_true", false, env)).toBe("нет")
    expect(formatHistoryValue("confirms_hypothesis_if_true", true, env)).toBe("да")
    expect(formatHistoryValue("importance", 7.0, env)).toBe("7")
  })

  it("HTML-поля: текст без разметки, пробелы схлопнуты", () => {
    expect(formatHistoryValue("text", "<p>a <b>b</b></p>\n<p>c</p>", env)).toBe("a b c")
    expect(formatHistoryValue("text", "<p></p>", env)).toBe(EMPTY_VALUE)
  })

  it("длинное значение обрезается до 140 знаков с многоточием", () => {
    const out = formatHistoryValue("title", "я".repeat(300), env)
    expect(out).toHaveLength(140)
    expect(out.endsWith("…")).toBe(true)
  })

  it("дата-время идёт через stamp, без результата — как есть", () => {
    expect(formatHistoryValue("expected_check_date", "2026-12-01T09:00:00+00:00", env)).toBe("stamp(2026-12-01T09:00:00+00:00)")
    expect(formatHistoryValue("deleted_at", "x", { ...env, stamp: () => undefined })).toBe("x")
  })

  it("обычные строки идут через word (status/priority/visibility), HTML-поля — нет", () => {
    expect(formatHistoryValue("status", "идея", env)).toBe("status:идея")
    expect(formatHistoryValue("title", "Привет", env)).toBe("title:Привет")
    expect(formatHistoryValue("text", "Привет", env)).toBe("Привет")
  })

  it("объекты не роняют экран", () => {
    expect(formatHistoryValue("x", { a: 1 }, env)).toBe('{"a":1}')
  })
})

describe("поля", () => {
  it("ключи шкал различаются по префиксу", () => {
    expect(isScaleField("scale:custom_3")).toBe(true)
    expect(isScaleField("importance")).toBe(false)
    expect(scaleIdOf("scale:custom_3")).toBe("custom_3")
  })

  it("fieldLabelKey: есть в словаре — ключ, нет (и служебные имена объекта) — null", () => {
    expect(fieldLabelKey("title")).toBe("history.field.title")
    expect(fieldLabelKey("zzz")).toBeNull()
    expect(fieldLabelKey("constructor")).toBeNull()
  })

  it("wordValues собирает status/priority без дублей", () => {
    const items = [
      item({ changed_fields: { status: { old: "идея", new: "проверяется" }, title: { old: "a", new: "b" } } }),
      item({ changed_fields: { status: { old: "проверяется", new: null }, priority: { old: "средний", new: "высокий" } } }),
    ]
    expect(wordValues(items).sort()).toEqual(["высокий", "идея", "проверяется", "средний"].sort())
  })

  it("служебные поля, которые видны в истории, имеют подписи", () => {
    for (const f of ["status", "visibility", "lab_id", "slug", "deleted_at", "hypothesis_id", "confirms_hypothesis_if_true", "is_onboarding"]) {
      expect(fieldLabelKey(f), `нет подписи для ${f}`).not.toBeNull()
    }
  })
})

// Дрейф: бэкенд добавил откатываемое поле — подпись нужна, иначе пользователь увидит имя колонки.
const BACKEND = path.resolve(process.cwd(), "../backend/app/services/undo.py")
describe.skipIf(!existsSync(BACKEND))("подписи покрывают UNDOABLE_FIELDS из backend/app/services/undo.py", () => {
  it("каждое поле: подпись в словаре или название встроенной шкалы", () => {
    const src = readFileSync(BACKEND, "utf8")
    const fields = new Set<string>()
    for (const m of src.matchAll(/"(\w+)":\s*frozenset\(\{([^}]*)\}\)/g)) {
      for (const f of m[2].matchAll(/"(\w+)"/g)) fields.add(f[1])
    }
    expect(fields.size).toBeGreaterThan(15)
    const scaleIds = new Set(DEFAULT_SCALES.map(s => s.id))
    const missing = [...fields].filter(f => fieldLabelKey(f) === null && !scaleIds.has(f))
    expect(missing).toEqual([])
  })
})
