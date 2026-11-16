import { describe, it, expect } from "vitest"
import { fitTransform } from "@/lib/graph-fit"

const apply = (f: { k: number; x: number; y: number }, p: { x: number; y: number }) => ({ x: p.x * f.k + f.x, y: p.y * f.k + f.y })

describe("fitTransform", () => {
  it("пусто или нет размера: null", () => {
    expect(fitTransform([], 800, 600)).toBeNull()
    expect(fitTransform([{ x: 1, y: 1 }], 0, 600)).toBeNull()
  })
  it("все точки оказываются внутри экрана с отступом", () => {
    const pts = [{ x: -3000, y: -100 }, { x: 4000, y: 2500 }, { x: 0, y: 0 }]
    const f = fitTransform(pts, 800, 600)!
    for (const p of pts) {
      const s = apply(f, p)
      expect(s.x).toBeGreaterThanOrEqual(48 - 1e-6); expect(s.x).toBeLessThanOrEqual(800 - 48 + 1e-6)
      expect(s.y).toBeGreaterThanOrEqual(48 - 1e-6); expect(s.y).toBeLessThanOrEqual(600 - 48 + 1e-6)
    }
  })
  it("огромный граф уменьшается ниже старого предела 0.25", () => {
    expect(fitTransform([{ x: 0, y: 0 }, { x: 10000, y: 10000 }], 800, 600)!.k).toBeLessThan(0.25)
  })
  it("маленький граф не увеличивается больше 1.5, одна точка по центру", () => {
    const f = fitTransform([{ x: 10, y: 10 }], 800, 600)!
    expect(f.k).toBe(1.5)
    expect(apply(f, { x: 10, y: 10 })).toEqual({ x: 400, y: 300 })
  })
  it("нечисловые координаты игнорируются", () => {
    expect(fitTransform([{ x: NaN, y: 1 }, { x: 5, y: 5 }], 800, 600)).not.toBeNull()
  })
})
