import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { OBSERVATION_STATUSES, DEFAULT_OBSERVATION_STATUS } from "@/lib/observation-constants"

// Список стадий живёт в двух местах (фронт и Literal на бэкенде) — этот тест
// не даёт им разойтись: именно такое расхождение породило баг с quick-add.
// Путь строим от cwd (vitest запускается из frontend/), а не от import.meta.url:
// под jsdom глобальный URL подменён и file:-ссылки не разбирает.
const BACKEND_SCHEMA = path.resolve(process.cwd(), "../backend/app/schemas/entities.py")

describe("стадии наблюдения: фронт и бэкенд", () => {
  it.skipIf(!existsSync(BACKEND_SCHEMA))("совпадают со списком в backend/app/schemas/entities.py (значения и порядок)", () => {
    const src = readFileSync(BACKEND_SCHEMA, "utf-8")
    const m = src.match(/ObservationStatus\s*=\s*Literal\[([^\]]+)\]/)
    expect(m).not.toBeNull()
    const backend = [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1])
    expect(OBSERVATION_STATUSES).toEqual(backend)
  })
  it("стадия по умолчанию входит в список", () => {
    expect(OBSERVATION_STATUSES).toContain(DEFAULT_OBSERVATION_STATUS)
  })
})
