import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { buildPieData } from "@/lib/stats-chart"
import { STRINGS } from "@/lib/i18n/strings"

const COLORS = { "идея": "#111111", "подтвердился": "#222222" }
const tr = (s: string) => `EN ${s}`

describe("buildPieData", () => {
  it("переводит подписи, а цвет берёт по исходному статусу", () => {
    expect(buildPieData({ "идея": 7, "подтвердился": 2 }, tr, COLORS)).toEqual([
      { name: "EN идея", value: 7, color: "#111111" },
      { name: "EN подтвердился", value: 2, color: "#222222" },
    ])
  })

  it("неизвестный статус получает цвет по умолчанию", () => {
    expect(buildPieData({ "новый": 1 }, tr, COLORS, "#999")).toEqual([{ name: "EN новый", value: 1, color: "#999" }])
  })

  it("пустые данные — пустой список", () => {
    expect(buildPieData(undefined, tr, COLORS)).toEqual([])
    expect(buildPieData({}, tr, COLORS)).toEqual([])
  })
})

describe("страница статистики: ключи", () => {
  it("нет осиротевших ключей stats.*", () => {
    const page = readFileSync("app/(app)/stats/page.tsx", "utf8")
    const own = Object.keys(STRINGS).filter(k => k.startsWith("stats."))
    expect(own.length).toBeGreaterThanOrEqual(6)
    for (const key of own) expect(page, `ключ ${key} не используется`).toContain(`"${key}"`)
  })
})
