import { describe, it, expect } from "vitest"
import { evidenceCell, discussionHref, verdictIcon, verdictKind } from "@/lib/feed-list"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const item = (id: number, type: string, extra: Record<string, unknown> = {}): FeedItem => ({
  id, entity_id: id, type, title: `T${id}`, preview: "", author_username: "a", author_display: "A",
  created_at: "2026-11-01T10:00:00Z", ...extra,
}) as FeedItem

const group = (coreType: string, relations: string[]): FeedGroup => ({
  key: `${coreType}:1`, core: item(1, coreType),
  members: relations.map((relation, i) => ({ item: item(10 + i, "observation"), relation })),
  internal: [], outside: [], activity: "2026-11-02T12:00:00Z", size: 1 + relations.length, topics: [],
})

describe("evidenceCell", () => {
  it("без участников прочерк — у любого типа, и у гипотезы тоже", () => {
    expect(evidenceCell(group("hypothesis", [])).kind).toBe("none")
    expect(evidenceCell(group("task", [])).kind).toBe("none")
    expect(evidenceCell(group("prediction", [])).kind).toBe("none")
  })

  it("у гипотезы с участниками — баланс: подтверждают / опровергают / прочие", () => {
    const c = evidenceCell(group("hypothesis", ["подтверждает", "подтверждает", "опровергает", "связано", "my-custom-type"]))
    expect(c).toEqual({ kind: "balance", balance: { confirm: 2, refute: 1, related: 2, total: 5 } })
  })

  it("у остальных типов с участниками — только число связей, без баланса", () => {
    for (const type of ["prediction", "question", "task", "worldview", "observation"]) {
      expect(evidenceCell(group(type, ["подтверждает", "опровергает", "связано"]))).toEqual({ kind: "links", n: 3 })
    }
  })
})

describe("discussionHref", () => {
  it("ведёт на страницу дискуссии записи", () => {
    expect(discussionHref(item(7, "question"))).toBe("/feed/discussion/question/7")
  })
  it("у репоста — на дискуссию источника, а не самого репоста", () => {
    expect(discussionHref(item(7, "hypothesis", { repost_source_type: "observation", repost_source_id: 9 })))
      .toBe("/feed/discussion/observation/9")
  })
})


describe("verdictKind", () => {
  it("гипотеза с подтверждениями или опровержениями — баланс", () => {
    expect(verdictKind(group("hypothesis", ["подтверждает", "связано"]))).toBe("balance")
    expect(verdictKind(group("hypothesis", ["опровергает"]))).toBe("balance")
  })
  it("гипотеза только со связями без оценки — related", () => {
    expect(verdictKind(group("hypothesis", ["связано", "my-custom-type"]))).toBe("related")
  })
  it("гипотеза без участников — none", () => {
    expect(verdictKind(group("hypothesis", []))).toBe("none")
  })
  it("не гипотеза — всегда status, сколько бы связей ни было", () => {
    for (const type of ["prediction", "observation", "question", "task", "worldview"]) {
      expect(verdictKind(group(type, []))).toBe("status")
      expect(verdictKind(group(type, ["подтверждает", "опровергает"]))).toBe("status")
    }
  })
})

describe("verdictIcon", () => {
  it("прогноз: исход проверки или ожидание", () => {
    expect(verdictIcon("prediction", "подтвердился")).toBe("check")
    expect(verdictIcon("prediction", "частично подтвердился")).toBe("partial")
    expect(verdictIcon("prediction", "не подтвердился")).toBe("x")
    expect(verdictIcon("prediction", "не проверен")).toBe("clock")
    expect(verdictIcon("prediction", null)).toBe("clock")
  })
  it("остальные типы — иконка типа; статус на неё не влияет", () => {
    expect(verdictIcon("observation", "подтвердился")).toBe("eye")
    expect(verdictIcon("question", undefined)).toBe("help")
    expect(verdictIcon("task", "решена")).toBe("task")
    expect(verdictIcon("worldview", null)).toBe("worldview")
    expect(verdictIcon("hypothesis", null)).toBe("bulb")
    expect(verdictIcon("zzz", null)).toBe("bulb")
  })
})
