import { describe, it, expect } from "vitest"
import { closeWarnings } from "@/lib/close-warnings"

const base = { status: "подтвердился", notes: "итог", confidence: 60, confirms_hypothesis_if_true: true, hypothesis_id: 3 }

describe("closeWarnings", () => {
  it("всё в порядке: предупреждений нет", () => expect(closeWarnings(base)).toEqual([]))
  it("стресс-тест: «подтвердился» и «частично» снижают сигнал, «не подтвердился» повышает", () => {
    expect(closeWarnings({ ...base, confirms_hypothesis_if_true: false })).toEqual(["closeWarn.stress.down"])
    expect(closeWarnings({ ...base, status: "частично подтвердился", confirms_hypothesis_if_true: false })).toEqual(["closeWarn.stress.down"])
    expect(closeWarnings({ ...base, status: "не подтвердился", confirms_hypothesis_if_true: false })).toEqual(["closeWarn.stress.up"])
  })
  it("стресс-тест без гипотезы сигнал не двигает: предупреждения нет", () =>
    expect(closeWarnings({ ...base, confirms_hypothesis_if_true: false, hypothesis_id: null })).toEqual([]))
  it("пустое пояснение (в том числе из пробелов) и отсутствие уверенности", () => {
    expect(closeWarnings({ ...base, notes: "   " })).toEqual(["closeWarn.noNotes"])
    expect(closeWarnings({ ...base, confidence: null })).toEqual(["closeWarn.noConfidence"])
  })
  it("поле не передано (undefined) — это не «нет уверенности» и не стресс-тест", () =>
    expect(closeWarnings({ status: "подтвердился", notes: "x" })).toEqual([]))
  it("исход не выбран: подсказок нет", () => expect(closeWarnings({ ...base, status: null, notes: "" })).toEqual([]))
})
