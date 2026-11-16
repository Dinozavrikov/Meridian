import { describe, it, expect } from "vitest"
import { nodeLabel, labelPriority, pickVisibleLabels, labelScale, type LabelBox } from "@/lib/graph-label"

const LONG = "Очень длинное название наблюдения, которое точно не влезет"
const box = (id: string, x: number, y: number, priority: number): LabelBox => ({ id, x, y, w: 60, h: 12, priority })

describe("nodeLabel", () => {
  it("режет до 24, центр до 28, короткое не трогает", () => {
    expect(nodeLabel({ label: LONG })).toBe(LONG.slice(0, 24) + "\u2026")
    expect(nodeLabel({ label: LONG, isCenter: true })).toBe(LONG.slice(0, 28) + "\u2026")
    expect(nodeLabel({ label: "Коротко" })).toBe("Коротко")
    expect(nodeLabel({ label: null })).toBe("")
  })
})

describe("labelPriority", () => {
  it("центр > гипотеза > остальные; внутри типа по числу связей", () => {
    const c = labelPriority({ type: "observation", isCenter: true }, 0)
    const h = labelPriority({ type: "hypothesis" }, 1)
    const o = labelPriority({ type: "observation" }, 50)
    expect(c).toBeGreaterThan(h)
    expect(h).toBeGreaterThan(o)
    expect(labelPriority({ type: "observation" }, 5)).toBeGreaterThan(labelPriority({ type: "observation" }, 2))
  })
})

describe("pickVisibleLabels", () => {
  it("при наложении выигрывает приоритетная", () => {
    expect([...pickVisibleLabels([box("low", 0, 0, 1), box("high", 10, 2, 9)])]).toEqual(["high"])
  })
  it("непересекающиеся показываются обе", () => {
    expect(pickVisibleLabels([box("a", 0, 0, 1), box("b", 200, 0, 1)]).size).toBe(2)
  })
  it("по вертикали тоже: рядом по x, но далеко по y — обе", () => {
    expect(pickVisibleLabels([box("a", 0, 0, 1), box("b", 0, 40, 1)]).size).toBe(2)
  })
  it("одинаковый приоритет и позиция: результат детерминирован", () => {
    expect([...pickVisibleLabels([box("b", 0, 0, 1), box("a", 0, 0, 1)])]).toEqual(["a"])
  })
  it("скрытая подпись освобождает место нижестоящей через цепочку", () => {
    // a перекрывает b, b перекрывал бы c, но b отброшена, поэтому c показывается
    const r = pickVisibleLabels([box("a", 0, 0, 9), box("b", 50, 0, 5), box("c", 100, 0, 1)])
    expect([...r].sort()).toEqual(["a", "c"])
  })
})

describe("labelScale", () => {
  it("не меньше 1 при отдалении и не больше 2 при сильном приближении", () => {
    expect(labelScale(0.25)).toBe(1)
    expect(labelScale(1)).toBe(1)
    expect(labelScale(100)).toBe(2)
  })
  it("растёт с зумом, но медленнее самих узлов", () => {
    expect(labelScale(4)).toBeGreaterThan(labelScale(2))
    expect(labelScale(4)).toBeLessThan(4)
  })
})
