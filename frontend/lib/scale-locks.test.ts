import { describe, it, expect } from "vitest"
import { getLockedScaleIds } from "@/lib/scale-locks"
import { DEFAULT_SCALES } from "@/lib/scales"

describe("getLockedScaleIds", () => {
  it("блокирует confidence у закрытого прогноза", () => {
    expect(getLockedScaleIds("prediction", { status: "подтвердился" })).toEqual(new Set(["confidence"]))
    expect(getLockedScaleIds("prediction", { status: "частично подтвердился" })).toEqual(new Set(["confidence"]))
    expect(getLockedScaleIds("prediction", { status: "не подтвердился" })).toEqual(new Set(["confidence"]))
  })

  it("не блокирует ничего у открытого прогноза", () => {
    expect(getLockedScaleIds("prediction", { status: "не проверен" }).size).toBe(0)
  })

  it("не блокирует, если status отсутствует/null (свежесозданная сущность, ещё нет данных)", () => {
    expect(getLockedScaleIds("prediction", {}).size).toBe(0)
    expect(getLockedScaleIds("prediction", { status: null }).size).toBe(0)
    expect(getLockedScaleIds("prediction", { status: undefined }).size).toBe(0)
  })

  // Критический кейс: id "confidence" общий у worldview и prediction (см. lib/scales.ts) — блокировка
  // обязана смотреть на пару (entityType, id), иначе шкала уверенности УБЕЖДЕНИЯ случайно
  // заблокируется по чужому статусу, если бы проверка шла только по id.
  it("НЕ блокирует confidence у worldview — это другая шкала с тем же id", () => {
    expect(getLockedScaleIds("worldview", { status: "подтвердился", confidence: 3 }).size).toBe(0)
    expect(getLockedScaleIds("worldview", { status: "не проверен" }).size).toBe(0)
  })

  it.each(["hypothesis", "observation", "question", "task"] as const)(
    "не блокирует ничего у %s ни при каком status", (entityType) => {
      for (const status of ["идея", "подтвердился", "не проверен", "открыта", undefined, null]) {
        expect(getLockedScaleIds(entityType, { status }).size, `entityType=${entityType} status=${status}`).toBe(0)
      }
    },
  )
})

describe("согласованность с lib/scales.ts", () => {
  it("id, которые getLockedScaleIds может вернуть, реально существуют как шкалы этого entityType", () => {
    // Ловит опечатку в scale-locks.ts (заблокировали несуществующий id — ScalesGrid его просто
    // не отрендерит, и блокировка окажется мёртвым кодом, молча ничего не защищая).
    const locked = getLockedScaleIds("prediction", { status: "подтвердился" })
    const predictionScaleIds = new Set(DEFAULT_SCALES.filter(s => s.entity_type === "prediction").map(s => s.id))
    for (const id of locked) expect(predictionScaleIds.has(id), `"${id}" не найден среди шкал prediction`).toBe(true)
  })
})

// С backend/app/services/undo.py регуляркой по исходнику не сверяемся: confidence прогноза в
// allowlist откатов сознательно ЕСТЬ, закрытый прогноз защищает evaluate_undo (prediction_closed).
// Реальное поведение (открыт — откат можно, закрыт — 409, PUT — 400) проверяет
// backend/tests/test_undo.py::test_closed_prediction_confidence_protected_in_put_and_undo,
// блокировку слайдера на фронте — тесты getLockedScaleIds выше.
