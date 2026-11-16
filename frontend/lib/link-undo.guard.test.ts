// Охранный (зелёный и до правки): типы событий, которые откатывает «Вернуть», существуют на бэкенде и не пересекаются.
import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { LINK_UNDO_TYPES } from "@/lib/link-undo"

vi.mock("@/lib/api", () => ({ api: {} }))
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

const src = readFileSync("../backend/app/services/link_events.py", "utf-8")
const known = new Set(
  (src.match(/^(?:COMPETING_TYPES|FIELD_TYPES|LINK_EVENT_TYPES) = .*$/gm) ?? []).join("\n").match(/"[a-z_]+"/g)?.map(s => s.slice(1, -1)) ?? [],
)

describe("LINK_UNDO_TYPES против backend/app/services/link_events.py", () => {
  it("каждый тип события заведён на бэкенде (иначе «Вернуть» никогда не найдёт событие)", () => {
    expect(known.size).toBeGreaterThanOrEqual(9)
    for (const [kind, types] of Object.entries(LINK_UNDO_TYPES)) for (const t of types) expect(known.has(t), `${kind}: ${t}`).toBe(true)
  })
  it("списки для добавления, удаления и смены не пересекаются", () => {
    const all = Object.values(LINK_UNDO_TYPES).flat()
    expect(new Set(all).size).toBe(all.length)
  })
})
