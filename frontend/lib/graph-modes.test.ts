import { describe, it, expect } from "vitest"
import { whatIfOn, blindOn, whatIfColor, blindColor, indexBlindSpots, countByRule, summarizeWhatIf, toggleId, COLORS, type WhatIfHyp } from "@/lib/graph-modes"

const ctx = (o: Partial<Parameters<typeof whatIfColor>[1]> = {}) =>
  ({ excluded: new Set<number>(), verdicts: new Map<string, string>(), loadBearing: new Set<string>(), ...o })
const obs = { id: "o_5", type: "observation", entityId: 5 }
const hyp = { id: "h_1", type: "hypothesis", entityId: 1 }

describe("whatIfColor", () => {
  it("исключённое наблюдение серое, обычное остаётся своего цвета", () => {
    expect(whatIfColor(obs, ctx({ excluded: new Set([5]) }), "#abc")).toBe(COLORS.excluded)
    expect(whatIfColor(obs, ctx(), "#abc")).toBe("#abc")
  })
  it("вердикты красят гипотезу, а устоявшая не меняется", () => {
    const c = (v: string) => whatIfColor(hyp, ctx({ verdicts: new Map([["h_1", v]]) }), "#abc")
    expect(c("collapsed")).toBe(COLORS.collapsed)
    expect(c("weakened")).toBe(COLORS.weakened)
    expect(c("strengthened")).toBe(COLORS.strengthened)
    expect(c("held")).toBe("#abc")
  })
  it("несущее наблюдение золотое, но исключение важнее", () => {
    expect(whatIfColor(obs, ctx({ loadBearing: new Set(["o_5"]) }), "#abc")).toBe(COLORS.loadBearing)
    expect(whatIfColor(obs, ctx({ loadBearing: new Set(["o_5"]), excluded: new Set([5]) }), "#abc")).toBe(COLORS.excluded)
  })
  it("исключение по id действует только на наблюдения, не на гипотезу с тем же числом", () => {
    expect(whatIfColor({ id: "h_5", type: "hypothesis", entityId: 5 }, ctx({ excluded: new Set([5]) }), "#abc")).toBe("#abc")
  })
})

describe("blind spots", () => {
  const items = [
    { rule: "no_predictions", type: "hypothesis", node_id: "h_1", eid: 1, label: "A" },
    { rule: "no_falsification", type: "hypothesis", node_id: "h_1", eid: 1, label: "A" },
    { rule: "observation_orphan", type: "observation", node_id: "o_2", eid: 2, label: "B" },
  ]
  const spots = indexBlindSpots(items)
  it("без выбранного правила подсвечены все проблемные, остальные приглушены", () => {
    expect(blindColor({ id: "h_1" }, spots, null)).toBe(COLORS.blind)
    expect(blindColor({ id: "o_2" }, spots, null)).toBe(COLORS.blind)
    expect(blindColor({ id: "h_9" }, spots, null)).toBe(COLORS.dim)
  })
  it("выбранное правило оставляет только свои узлы", () => {
    expect(blindColor({ id: "h_1" }, spots, "no_predictions")).toBe(COLORS.blind)
    expect(blindColor({ id: "o_2" }, spots, "no_predictions")).toBe(COLORS.dim)
  })
  it("счётчики по правилам", () => {
    expect(countByRule(items)).toEqual({ no_predictions: 1, no_falsification: 1, observation_orphan: 1 })
  })
})

describe("summarizeWhatIf / toggleId", () => {
  const h = (verdict: WhatIfHyp["verdict"], lb: string[]): WhatIfHyp =>
    ({ node_id: "h", eid: 1, name: "H", level_before: 1, level_after: 0, verdict, load_bearing: lb, observation_count: 1, signal_before: 0, signal_after: 0, affected: false })
  it("считает вердикты и уникальные несущие наблюдения", () => {
    expect(summarizeWhatIf([h("collapsed", ["o_1"]), h("held", ["o_1", "o_2"]), h("weakened", [])]))
      .toEqual({ collapsed: 1, weakened: 1, held: 1, strengthened: 0, unknown: 0, loadBearing: 2, affected: 0 })
  })
  it("toggleId добавляет и убирает", () => {
    expect(toggleId([1], 2)).toEqual([1, 2])
    expect(toggleId([1, 2], 1)).toEqual([2])
  })
})

describe("выделение", () => {
  const base = { excluded: new Set<number>(), verdicts: new Map<string, string>(), loadBearing: new Set<string>() }
  it("whatIfOn: исключённое, изменившееся, затронутое и несущее выделены, остальное нет", () => {
    expect(whatIfOn({ id: "o_5", type: "observation", entityId: 5 }, { ...base, excluded: new Set([5]) })).toBe(true)
    expect(whatIfOn({ id: "h_1", type: "hypothesis", entityId: 1 }, { ...base, verdicts: new Map([["h_1", "weakened"]]) })).toBe(true)
    expect(whatIfOn({ id: "h_1", type: "hypothesis", entityId: 1 }, { ...base, verdicts: new Map([["h_1", "held"]]) })).toBe(false)
    expect(whatIfOn({ id: "h_1", type: "hypothesis", entityId: 1 }, { ...base, affected: new Set(["h_1"]) })).toBe(true)
    expect(whatIfOn({ id: "o_2", type: "observation", entityId: 2 }, { ...base, loadBearing: new Set(["o_2"]) })).toBe(true)
  })
  it("затронутая, но устоявшая гипотеза окрашена отдельным цветом", () => {
    const c = whatIfColor({ id: "h_1", type: "hypothesis", entityId: 1 }, { ...base, verdicts: new Map([["h_1", "held"]]), affected: new Set(["h_1"]) }, "#abc")
    expect(c).toBe(COLORS.affected)
  })
  it("blindOn учитывает выбранное правило", () => {
    const spots = new Map([["h_1", new Set(["no_predictions"])]])
    expect(blindOn({ id: "h_1" }, spots, null)).toBe(true)
    expect(blindOn({ id: "h_1" }, spots, "no_predictions")).toBe(true)
    expect(blindOn({ id: "h_1" }, spots, "no_falsification")).toBe(false)
    expect(blindOn({ id: "h_2" }, spots, null)).toBe(false)
  })
})

describe("чужая гипотеза (verdict unknown)", () => {
  const base = { excluded: new Set<number>(), loadBearing: new Set<string>() }
  const ctx = { ...base, verdicts: new Map([["h_1", "unknown"]]), affected: new Set(["h_1"]) }
  const h = { id: "h_1", type: "hypothesis", entityId: 1 }
  it("окрашена как затронутая и выделена", () => {
    expect(whatIfColor(h, ctx, "#abc")).toBe(COLORS.affected)
    expect(whatIfOn(h, ctx)).toBe(true)
  })
  it("без затронутости не выделяется цветом вердикта", () => {
    expect(whatIfColor(h, { ...ctx, affected: new Set() }, "#abc")).toBe("#abc")
  })
})
