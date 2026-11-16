import { describe, it, expect } from "vitest"
import { countsByType, summarizeRelated } from "@/lib/related-summary"

const items = (...types: (string | null)[]) => types.map(link_type => ({ link_type }))

describe("summarizeRelated", () => {
  it("считает по типам и разделяет подтверждающие, опровергающие и прочие связи", () => {
    expect(summarizeRelated({ hypothesis: items("подтверждает", "опровергает", "связано", null) }))
      .toEqual([{ type: "hypothesis", count: 4, confirming: 1, refuting: 1, neutral: 2 }])
  })

  it("порядок типов фиксирован, пустые типы пропускаются, незнакомые идут в конце", () => {
    const rows = summarizeRelated({ task: items("связано"), hypothesis: items("связано"), question: [], custom: items("связано") })
    expect(rows.map(r => r.type)).toEqual(["hypothesis", "task", "custom"])
  })

  it("пусто — пустая сводка", () => {
    expect(summarizeRelated({})).toEqual([])
  })
})

describe("countsByType", () => {
  it("известные типы присутствуют всегда (нули у отсутствующих), чтобы пустая вкладка была приглушена", () => {
    expect(countsByType({ hypothesis: items("связано", "связано") }))
      .toEqual({ hypothesis: 2, observation: 0, prediction: 0, worldview: 0, question: 0, task: 0 })
  })

  it("незнакомый тип тоже считается", () => {
    expect(countsByType({ custom: items("связано") }).custom).toBe(1)
  })
})
