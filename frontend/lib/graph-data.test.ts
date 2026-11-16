import { describe, it, expect } from "vitest"
import { toForceGraphNode } from "@/lib/graph-data"

describe("toForceGraphNode", () => {
  it("подпись узла — название, дата едет отдельным полем", () => {
    expect(toForceGraphNode({ id: "o_1", label: "Название", type: "observation", eid: 1, date: "2026-09-04" }))
      .toEqual({ id: "o_1", label: "Название", type: "observation", entityId: 1, date: "2026-09-04" })
  })
  it("у узлов без даты (гипотеза) поле date пустое", () => {
    expect(toForceGraphNode({ id: "h_2", label: "Г", type: "hypothesis", eid: 2 }).date).toBeUndefined()
  })
})
