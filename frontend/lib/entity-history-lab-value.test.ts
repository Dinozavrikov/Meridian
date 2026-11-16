import { describe, it, expect } from "vitest"
import { EMPTY_VALUE, formatHistoryValue, type ValueEnv } from "@/lib/entity-history-view"

const base: ValueEnv = { yes: "да", no: "нет", stamp: () => undefined, word: (_f, raw) => raw }
const names: Record<number, string> = { 7: "Лаборатория сна" }
const env: ValueEnv = { ...base, lab: id => names[id] ?? `№${id}` }

describe("lab_id в истории правок", () => {
  it("id лаборатории заменяется названием", () => {
    expect(formatHistoryValue("lab_id", 7, env)).toBe("Лаборатория сна")
  })
  it("лаборатория, которой нет в списке пользователя, получает запасную подпись, а не голый id", () => {
    expect(formatHistoryValue("lab_id", 9, env)).toBe("№9")
  })
  it("пустое значение — прочерк, а не «null» и не «0»", () => {
    expect(formatHistoryValue("lab_id", null, env)).toBe(EMPTY_VALUE)
  })
  it("без lab в окружении остаётся число (прежнее поведение)", () => {
    expect(formatHistoryValue("lab_id", 7, base)).toBe("7")
  })
  it("другие числовые поля не трогаются", () => {
    expect(formatHistoryValue("importance", 7, env)).toBe("7")
  })
})
