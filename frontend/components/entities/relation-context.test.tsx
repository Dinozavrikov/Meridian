import { describe, it, expect, vi } from "vitest"
import { buildRelationContext } from "@/components/entities/relation-context"

vi.mock("@/components/entities/link-provenance-row", () => ({ LinkProvenanceRow: () => null }))
const t = (k: string, p?: Record<string, string>) => (p?.title ? `${k}:${p.title}` : k)
const linkTypes = [{ value: "подтверждает", label: "Подтверждает", color: "#2ECC71" }, { value: "опровергает", label: "Опровергает", color: "#E74C3C" }, { value: "связано", label: "Связано", color: "#4A90D9" }]
const o = { t, linkTypes, parentTitle: "Родитель" }

describe("buildRelationContext", () => {
  it("прямая связь: тип, «Связал» и замок; «Через» нет", () => {
    const c = buildRelationContext({ link_type: "подтверждает", direct: true, linked_by: { username: "a" } as never, lock: { code: "other_author" } as never }, o)
    expect(c.label).toBe("Подтверждает"); expect(c.via).toBeUndefined(); expect(c.provenance).not.toBeNull(); expect(c.lock).toEqual({ code: "other_author" })
  })
  it("косвенная связь получает те же секции, что и прямая, плюс «Через»", () => {
    const c = buildRelationContext({ link_type: "связано", direct: false, linked_by: { username: "a" } as never }, o)
    expect(c.label).toBe("Связано"); expect(c.via).toBe("relations.via:Родитель"); expect(c.provenance).not.toBeNull()
  })
  it("связь из поля прогноза берёт тип из stance, конкурирующая — роль", () => {
    expect(buildRelationContext({ source: "field", stance: "подтверждает", link_type: "связано" }, o).label).toBe("Подтверждает")
    expect(buildRelationContext({ source: "competing", role: "leading" }, o).label).toBe("relations.role.leading")
  })
  it("цвет чипа берётся у типа связи; у конкурирующей связи цвета нет", () => {
    expect(buildRelationContext({ link_type: "опровергает", direct: true }, o).color).toBe("#E74C3C")
    expect(buildRelationContext({ source: "field", stance: "подтверждает" }, o).color).toBe("#2ECC71")
    expect(buildRelationContext({ source: "competing", role: "leading" }, o).color).toBeUndefined()
  })
  it("нет данных — нет секций", () => {
    const c = buildRelationContext({ direct: true }, o)
    expect(c.provenance).toBeNull(); expect(c.lock).toBeNull(); expect(c.via).toBeUndefined()
  })
})
