import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Контракт GET /{type}/{id}/link-history: имена полей интерфейса LinkHistoryItem (фронт)
// и схемы LinkHistoryOut (бэкенд) совпадают в обе стороны. Сверяются ТОЛЬКО имена, не типы
// и не null-ность. Файлы читаются с диска: нет файла или не разобрался класс — тест падает.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")

function tsFields(src: string): string[] {
  const m = src.match(/export interface LinkHistoryItem \{([\s\S]*?)\n\}/)
  if (!m) throw new Error("interface LinkHistoryItem не найден в entity-history-api.ts")
  const body = "\n" + m[1].replace(/\/\/.*$/gm, "")
  return [...body.matchAll(/(?:\n|;|\{)\s*(\w+)\??\s*:/g)].map(x => x[1])
}

function pyFields(src: string): string[] {
  const m = src.match(/class LinkHistoryOut\(BaseModel\):\n([\s\S]*?)\n\n\n/)
  if (!m) throw new Error("класс LinkHistoryOut не найден в backend/app/api/v1/undo.py")
  return [...m[1].matchAll(/^    (\w+)\s*:/gm)].map(x => x[1])
}

describe("контракт link-history: фронт и бэкенд", () => {
  const ts = tsFields(read("./entity-history-api.ts"))
  const py = pyFields(read("../../backend/app/api/v1/undo.py"))

  it("оба списка полей разобраны (защита от пустого совпадения)", () => {
    for (const list of [ts, py]) {
      expect(list.length).toBeGreaterThan(10)
      expect(list).toEqual(expect.arrayContaining(["id", "created_at", "undoable"]))
    }
  })

  it("каждое поле, которое читает фронт, отдаёт бэкенд", () => {
    expect(ts.filter(k => !py.includes(k))).toEqual([])
  })

  it("каждое поле, которое отдаёт бэкенд, описано на фронте", () => {
    expect(py.filter(k => !ts.includes(k))).toEqual([])
  })
})
