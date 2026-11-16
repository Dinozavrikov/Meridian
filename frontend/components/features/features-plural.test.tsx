import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"

const env = vi.hoisted(() => ({ n: 1 }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/features-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/features-map")>("@/lib/features-map")
  return { ...actual, featureStats: () => ({ recordTypes: env.n, linkKinds: env.n, stages: env.n, visibilityLevels: env.n }) }
})

import { FeatureStats } from "./FeatureStats"

const S = STRINGS as Record<string, string>
afterEach(cleanup)

const LABELS = {
  one: ["Тип записи", "Вид связи", "Стадия пути", "Уровень видимости"],
  few: ["Типа записей", "Вида связи", "Стадии пути", "Уровня видимости"],
  many: ["Типов записей", "Видов связи", "Стадий пути", "Уровней видимости"],
}
const CASES: [number, keyof typeof LABELS][] = [
  [1, "one"], [2, "few"], [4, "few"], [5, "many"], [6, "many"], [8, "many"], [11, "many"], [12, "many"], [14, "many"], [21, "one"], [22, "few"], [25, "many"],
]

describe("плитки статистики согласуются с числом", () => {
  it.each(CASES)("%i → форма %s", (n, form) => {
    env.n = n
    render(<FeatureStats />)
    for (const label of LABELS[form]) expect(screen.getByText(label), `${n}: ${label}`).toBeTruthy()
    expect(screen.getAllByText(String(n)).length).toBe(4)
  })
  it("старых несогласованных заголовков в строках нет, все три формы заданы", () => {
    for (const base of ["records", "links", "stages", "visibility"]) {
      expect(S[`featuresPage.stat.${base}`], base).toBeUndefined()
      for (const suf of ["One", "Few", "Many"]) expect(S[`featuresPage.stat.${base}${suf}`]?.trim(), base + suf).toBeTruthy()
    }
  })
})
