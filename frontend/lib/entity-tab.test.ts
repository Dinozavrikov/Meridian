import { describe, it, expect } from "vitest"
import { resolveEntityTab, relatedTabsFor } from "@/lib/entity-tab"

describe("resolveEntityTab", () => {
  it("старая вкладка «связи» ведёт на главную, а не в пустоту", () => {
    expect(resolveEntityTab("relations")).toBe("detail")
  })
  it("обычные вкладки не меняются", () => {
    for (const tab of ["detail", "history", "sources", "images", "hypotheses"]) expect(resolveEntityTab(tab)).toBe(tab)
  })
  it("нет значения — главная", () => {
    expect(resolveEntityTab(null)).toBe("detail")
    expect(resolveEntityTab(undefined)).toBe("detail")
    expect(resolveEntityTab("")).toBe("detail")
  })
})

describe("relatedTabsFor", () => {
  it("у сущности нет вкладки на собственный тип, кроме убеждений", () => {
    for (const type of ["observation", "hypothesis", "prediction", "question"]) expect(relatedTabsFor(type)[type]).toBeUndefined()
    expect(relatedTabsFor("worldview").worldview).toBe("worldview")
  })
  it("неизвестный тип (задачи пока не переведены) — пустая таблица, а не падение", () => {
    expect(relatedTabsFor("task")).toEqual({ hypothesis: "hypotheses", observation: "observations", prediction: "predictions", worldview: "worldview" })
    expect(relatedTabsFor("nope")).toEqual({})
  })
})
