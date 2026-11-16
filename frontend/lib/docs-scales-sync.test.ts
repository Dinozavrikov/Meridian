// Шкалы интерфейса и константы формулы живут в разных языках: тест ловит расхождение.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_SCALES } from "@/lib/scales"

const he = readFileSync(join(process.cwd(), "..", "backend", "app/services/hypothesis_evidence.py"), "utf-8")
const num = (name: string) => Number(new RegExp(`^${name} = ([0-9.]+)`, "m").exec(he)?.[1])
const scale = (id: string, type: string) => DEFAULT_SCALES.find(s => s.id === id && s.entity_type === type)!

describe("шкалы интерфейса совпадают с константами формулы", () => {
  it("уровней зрелости столько же, сколько базовых порогов", () => {
    const m = /BASE_THRESHOLDS = \[([^\]]*)\]/.exec(he)!
    const thresholds = m[1].split(",").map(s => s.trim()).filter(Boolean)
    const s = scale("maturity", "hypothesis")
    expect(s.levels.map(l => l.value)).toEqual(thresholds.map((_, i) => i))
    expect(s.max - s.min + 1).toBe(thresholds.length)
  })
  it("шкала риска идет до RISK_SCALE", () => {
    expect(scale("risk", "hypothesis").max).toBe(num("RISK_SCALE"))
  })
  it("шкала значимости наблюдения идет до IMPORTANCE_MAX", () => {
    expect(scale("importance", "observation").max).toBe(num("IMPORTANCE_MAX"))
  })
})
