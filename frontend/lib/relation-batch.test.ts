import { describe, it, expect } from "vitest"
import { batchState, buildOps, canSetType, type BatchRow } from "@/lib/relation-batch"

const row = (o: Partial<BatchRow>): BatchRow => ({ key: "k", type: "observation", id: 1, title: "т", source: "link", current: "связано", ...o })

describe("batchState", () => {
  it("свою связь с правами можно выбрать", () => {
    expect(batchState({ source: "link", capabilities: ["remove", "set_type"] })).toEqual({ ok: true })
  })
  it("конкурирующая гипотеза в пакет не входит", () => {
    expect(batchState({ source: "competing", capabilities: ["remove", "set_role", "set_stance"] })).toEqual({ ok: false, reason: "relations.batch.competing" })
  })
  it("причина блокировки берётся из lock", () => {
    expect(batchState({ source: "link", capabilities: [], lock: { code: "other_author" } }).reason).toBe("relations.batch.otherAuthor")
    expect(batchState({ source: "field", capabilities: [], lock: { code: "pred_closed" } }).reason).toBe("relations.batch.pred_closed")
    expect(batchState({ source: "link", capabilities: [] }).reason).toBe("relations.batch.noRights")
  })
  it("без списка прав работает прежнее правило can_edit", () => {
    expect(batchState({ source: "link", can_edit: false }).ok).toBe(false)
    expect(batchState({ source: "link" }).ok).toBe(true)
  })
})

describe("buildOps / canSetType", () => {
  const picks = [row({ type: "hypothesis", id: 5, source: "field" }), row({ id: 9 })]
  it("удаление и смена типа: источник field/link, link_type только у смены", () => {
    expect(buildOps(picks, { kind: "remove" })).toEqual([
      { op: "remove", other_type: "hypothesis", other_id: 5, source: "field" },
      { op: "remove", other_type: "observation", other_id: 9, source: "link" }])
    expect(buildOps(picks, { kind: "set_type", linkType: "опровергает" })[1]).toEqual(
      { op: "set_type", other_type: "observation", other_id: 9, source: "link", link_type: "опровергает" })
  })
  it("«связано» недопустимо, если среди выбранных есть связь из поля", () => {
    expect(canSetType(picks, "связано")).toBe(false)
    expect(canSetType(picks, "опровергает")).toBe(true)
    expect(canSetType([row({})], "связано")).toBe(true)
  })
})
