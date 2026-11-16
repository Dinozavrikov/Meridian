import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { HYPOTHESIS_STATUSES, DEFAULT_HYPOTHESIS_STATUS } from "@/lib/hypothesis-constants"

// Путь от cwd (vitest запускается из frontend/): под jsdom глобальный URL подменён и file:-ссылки не разбирает.
const BACKEND_SCHEMA = path.resolve(process.cwd(), "../backend/app/schemas/entities.py")

describe("статусы гипотезы: фронт и бэкенд", () => {
  it.skipIf(!existsSync(BACKEND_SCHEMA))("совпадают с Literal HypothesisStatus в backend/app/schemas/entities.py (значения и порядок)", () => {
    const m = readFileSync(BACKEND_SCHEMA, "utf-8").match(/HypothesisStatus\s*=\s*Literal\[([^\]]+)\]/)
    expect(m).not.toBeNull()
    const backend = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1])
    expect(HYPOTHESIS_STATUSES).toEqual(backend)
  })
  it("статус по умолчанию входит в список, дублей нет", () => {
    expect(HYPOTHESIS_STATUSES).toContain(DEFAULT_HYPOTHESIS_STATUS)
    expect(new Set(HYPOTHESIS_STATUSES).size).toBe(HYPOTHESIS_STATUSES.length)
  })
})
