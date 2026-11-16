import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { CLOSED_PREDICTION_STATUSES, OPEN_PREDICTION_STATUS, PREDICTION_STATUSES, isClosedPrediction } from "@/lib/prediction-status"

describe("isClosedPrediction", () => {
  it.each([
    ["подтвердился", true],
    ["частично подтвердился", true],
    ["не подтвердился", true],
    ["не проверен", false],
    [null, false],
    [undefined, false],
    ["", false],
    ["неизвестный статус", false],
  ])("%s -> %s", (status, expected) => {
    expect(isClosedPrediction(status as any)).toBe(expected)
  })
})

describe("константы статусов", () => {
  it("OPEN_PREDICTION_STATUS не входит в CLOSED_PREDICTION_STATUSES", () => {
    expect(CLOSED_PREDICTION_STATUSES).not.toContain(OPEN_PREDICTION_STATUS)
  })

  it("нет дублей", () => {
    expect(new Set(CLOSED_PREDICTION_STATUSES).size).toBe(CLOSED_PREDICTION_STATUSES.length)
  })
})

// Рассинхрон с backend/app/core/prediction_status.py (добавили статус на бэкенде, забыли на
// фронте — или наоборот) означает: либо форма даёт редактировать то, что сервер уже отклонит,
// либо блокирует то, что сервер давно разрешает. См. lib/attachments.test.ts — тот же приём.
const BACKEND = path.resolve(process.cwd(), "../backend/app/core/prediction_status.py")

describe.skipIf(!existsSync(BACKEND))("соответствие backend/app/core/prediction_status.py", () => {
  it("CLOSED_PREDICTION_STATUSES совпадает как множество", () => {
    const src = readFileSync(BACKEND, "utf8")
    const m = src.match(/CLOSED_PREDICTION_STATUSES\s*=\s*\(([^)]*)\)/)
    expect(m, "не нашли CLOSED_PREDICTION_STATUSES в backend").not.toBeNull()
    const backendStatuses = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1])
    expect(new Set(CLOSED_PREDICTION_STATUSES)).toEqual(new Set(backendStatuses))
  })
})

// Literal PredictionStatus на бэкенде — тот же список, что и PREDICTION_STATUSES на фронте.
const BACKEND_SCHEMA = path.resolve(process.cwd(), "../backend/app/schemas/entities.py")
describe.skipIf(!existsSync(BACKEND_SCHEMA))("PredictionStatus в backend/app/schemas/entities.py", () => {
  it("совпадает с PREDICTION_STATUSES (значения и порядок)", () => {
    const src = readFileSync(BACKEND_SCHEMA, "utf8")
    const m = src.match(/PredictionStatus\s*=\s*Literal\[([^\]]+)\]/)
    expect(m, "не нашли PredictionStatus в backend").not.toBeNull()
    const backend = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1])
    expect(PREDICTION_STATUSES).toEqual(backend)
  })
})
