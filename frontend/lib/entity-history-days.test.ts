import { describe, it, expect } from "vitest"
import { dayHeaderLabel, groupByDay } from "@/lib/entity-history-days"

// Время строится из ЛОКАЛЬНЫХ компонентов: тесты не зависят от часового пояса машины.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const row = (d: Date) => ({ created_at: d.toISOString() })
const t = (k: string) => k
const NOW = at(2026, 10, 3, 14)

describe("groupByDay", () => {
  it("подряд идущие записи одного дня — в одну группу, порядок сохраняется", () => {
    const rows = [at(2026, 10, 3, 19, 56), at(2026, 10, 3, 9, 1), at(2026, 10, 2, 23, 59), at(2026, 9, 20)].map(row)
    const groups = groupByDay(rows, r => r.created_at)
    expect(groups.map(g => [g.key, g.items.length])).toEqual([["2026-10-03", 2], ["2026-10-02", 1], ["2026-09-20", 1]])
  })

  it("граница суток считается по локальному времени", () => {
    const groups = groupByDay([at(2026, 10, 3, 0, 30), at(2026, 10, 2, 23, 30)].map(row), r => r.created_at)
    expect(groups).toHaveLength(2)
  })

  it("неразбираемая дата не теряется, пусто даёт пусто", () => {
    const groups = groupByDay([{ created_at: "мусор" }], r => r.created_at)
    expect(groups).toEqual([{ key: "unknown", date: null, items: [{ created_at: "мусор" }] }])
    expect(groupByDay([], () => "")).toEqual([])
  })
})

describe("dayHeaderLabel", () => {
  it("сегодня и вчера, в том числе через границу месяца", () => {
    expect(dayHeaderLabel(at(2026, 10, 3, 8), NOW, "ru", t)).toBe("history.today")
    expect(dayHeaderLabel(at(2026, 10, 2, 8), NOW, "ru", t)).toBe("history.yesterday")
    expect(dayHeaderLabel(at(2026, 10, 31, 8), at(2026, 11, 1, 10), "ru", t)).toBe("history.yesterday")
  })

  it("в этом году — день и месяц без года, в прошлом — с годом", () => {
    const same = dayHeaderLabel(at(2026, 9, 20), NOW, "ru", t)
    expect(same).toContain("20")
    expect(same).not.toContain("2026")
    expect(dayHeaderLabel(at(2025, 10, 3), NOW, "ru", t)).toContain("2025")
  })

  it("неизвестная дата — пустая подпись", () => {
    expect(dayHeaderLabel(null, NOW, "ru", t)).toBe("")
  })
})
