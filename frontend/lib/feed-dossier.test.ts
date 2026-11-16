import { describe, it, expect } from "vitest"
import { typeColor } from "@/lib/theme"
import { GRAPH_MAX_SLOTS, GRAPH_SIZE, REL_COLOR, evidenceBalance, graphModel, nextCheck } from "@/lib/feed-dossier"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const item = (type: string, id: number, over: Record<string, unknown> = {}): FeedItem => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: "", author_username: "a", author_display: "a",
  created_at: "2026-11-01T00:00:00Z", status: null, ...over,
})
const group = (core: FeedItem, members: { item: FeedItem; relation: string }[] = []): FeedGroup => ({
  key: `${core.type}:${core.entity_id}`, core, members, internal: [], outside: [],
  activity: "2026-11-01T00:00:00Z", size: 1 + members.length, topics: [],
})
const mem = (type: string, id: number, relation = "связано", over: Record<string, unknown> = {}) => ({ item: item(type, id, over), relation })

describe("evidenceBalance", () => {
  it("считает подтверждающие, опровергающие и прочие; свой тип связи — «связано»", () => {
    const b = evidenceBalance([{ relation: "подтверждает" }, { relation: "подтверждает" }, { relation: "опровергает" },
      { relation: "связано" }, { relation: "влияет косвенно" }])
    expect(b).toEqual({ confirm: 2, refute: 1, related: 2, total: 5 })
  })
  it("пусто — нули", () => expect(evidenceBalance([])).toEqual({ confirm: 0, refute: 0, related: 0, total: 0 }))
})

describe("nextCheck", () => {
  const NOW = new Date(2026, 10, 6, 12, 0)
  const pred = (id: number, y: number, m: number, d: number, over: Record<string, unknown> = {}) =>
    mem("prediction", id, "связано", { status: "не проверен", expected_check_date: new Date(y, m, d, 9, 0).toISOString(), ...over })

  it("будущая проверка: число дней до неё", () => {
    const r = nextCheck(group(item("hypothesis", 1), [pred(2, 2026, 10, 20)]), NOW)
    expect(r).toMatchObject({ state: "future", days: 14 })
    expect(r!.item.entity_id).toBe(2)
  })
  it("сегодня и просрочена", () => {
    expect(nextCheck(group(item("hypothesis", 1), [pred(2, 2026, 10, 6)]), NOW)).toMatchObject({ state: "today", days: 0 })
    expect(nextCheck(group(item("hypothesis", 1), [pred(2, 2026, 10, 1)]), NOW)).toMatchObject({ state: "overdue", days: 5 })
  })
  it("из нескольких берётся самая ранняя (просроченная раньше будущей)", () => {
    const r = nextCheck(group(item("hypothesis", 1), [pred(2, 2026, 10, 20), pred(3, 2026, 10, 1), pred(4, 2026, 11, 30)]), NOW)
    expect(r!.item.entity_id).toBe(3)
  })
  it("закрытые прогнозы, записи без даты и с мусорной датой, не прогнозы — не считаются", () => {
    const g = group(item("hypothesis", 1), [
      pred(2, 2026, 10, 20, { status: "подтвердился" }), pred(3, 2026, 10, 20, { status: "не подтвердился" }),
      pred(4, 2026, 10, 20, { status: "частично подтвердился" }),
      mem("prediction", 5, "связано", { status: "не проверен" }),
      mem("prediction", 6, "связано", { status: "не проверен", expected_check_date: "не дата" }),
      mem("observation", 7, "связано", { expected_check_date: new Date(2026, 10, 20).toISOString() }),
    ])
    expect(nextCheck(g, NOW)).toBeNull()
  })
  it("прогноз может быть и ядром карточки", () => {
    const core = item("prediction", 9, { status: "не проверен", expected_check_date: new Date(2026, 10, 10, 9).toISOString() })
    expect(nextCheck(group(core), NOW)).toMatchObject({ state: "future", days: 4 })
  })
})

describe("graphModel", () => {
  const types = ["observation", "prediction", "question", "task", "worldview", "hypothesis", "observation", "question", "task", "observation"]
  const many = (n: number) => Array.from({ length: n }, (_, i) => mem(types[i % types.length], 100 + i, ["подтверждает", "опровергает", "связано"][i % 3]))

  it("без участников — одно ядро в центре", () => {
    const m = graphModel(group(item("hypothesis", 1)))
    expect(m.nodes).toEqual([]); expect(m.edges).toEqual([]); expect(m.hidden).toBe(0)
    expect(m.core).toMatchObject({ x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2, fill: typeColor.hypothesis })
  })
  it("цвет узла — тип записи, цвет ребра — тип связи; нейтральные связи пунктиром; первый узел сверху", () => {
    const m = graphModel(group(item("hypothesis", 1), many(3)))
    expect(m.nodes).toHaveLength(3)
    expect(m.nodes[0]).toMatchObject({ x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 - 46, fill: typeColor.observation })
    expect(m.nodes[1].fill).toBe(typeColor.prediction)
    expect(m.edges.map(e => e.stroke)).toEqual([REL_COLOR.confirm, REL_COLOR.refute, REL_COLOR.neutral])
    expect(m.edges.map(e => e.dashed)).toEqual([false, false, true])
  })
  it("до восьми участников — все узлы, свыше — семь и узел «+N»", () => {
    const eight = graphModel(group(item("hypothesis", 1), many(GRAPH_MAX_SLOTS)))
    expect(eight.nodes).toHaveLength(GRAPH_MAX_SLOTS); expect(eight.hidden).toBe(0)
    expect(eight.nodes.some(n => n.hollow)).toBe(false)
    const eleven = graphModel(group(item("hypothesis", 1), many(11)))
    expect(eleven.nodes).toHaveLength(GRAPH_MAX_SLOTS)
    expect(eleven.nodes.filter(n => n.hollow)).toHaveLength(1)
    expect(eleven.hidden).toBe(11 - (GRAPH_MAX_SLOTS - 1))
    expect(eleven.edges).toHaveLength(GRAPH_MAX_SLOTS)
  })
  it("узлы не накладываются друг на друга и не выходят за рамку рисунка", () => {
    const m = graphModel(group(item("hypothesis", 1), many(12)))
    const pts = m.nodes.map(n => `${n.x},${n.y}`)
    expect(new Set(pts).size).toBe(pts.length)
    for (const n of m.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0); expect(n.x + n.r).toBeLessThanOrEqual(GRAPH_SIZE)
      expect(n.y - n.r).toBeGreaterThanOrEqual(0); expect(n.y + n.r).toBeLessThanOrEqual(GRAPH_SIZE)
    }
  })
})
