import { describe, it, expect } from "vitest"
import { linkProvenance } from "@/lib/link-provenance"

const t = (key: string, p?: Record<string, string>) => `${key}|${p?.name ?? ""}|${p?.date ?? ""}`
const by = { username: "u", display_name: "Алексей" }

describe("linkProvenance", () => {
  it("с датой: имя и дата", () => {
    expect(linkProvenance(t, { source: "link", linked_by: by, linked_at: "2026-10-18T10:00:00Z" })).toMatch(/^relations\.linkedByAt\|Алексей\|.+/)
  })
  it("связь из таблицы без даты — «давно»", () => {
    expect(linkProvenance(t, { source: "link", linked_by: by, linked_at: null })).toBe("relations.linkedByOld|Алексей|")
  })
  it("связь из поля без даты — только имя, без «давно»", () => {
    expect(linkProvenance(t, { source: "field", linked_by: by, linked_at: null })).toBe("relations.linkedBy|Алексей|")
  })
  it("без автора ничего; без display_name берётся username", () => {
    expect(linkProvenance(t, { source: "competing", linked_by: null })).toBeNull()
    expect(linkProvenance(t, { source: "field", linked_by: { username: "u" } })).toBe("relations.linkedBy|u|")
  })
})
