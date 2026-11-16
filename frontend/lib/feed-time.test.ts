import { describe, it, expect } from "vitest"
import { formatFeedTime } from "@/lib/feed-time"

// Даты строим в локальном времени, чтобы тест не зависел от часового пояса машины.
const NOW = new Date(2026, 10, 6, 18, 0)

describe("formatFeedTime", () => {
  it("сегодня — только время", () => {
    expect(formatFeedTime(new Date(2026, 10, 6, 14, 3), NOW)).toBe("14:03")
  })
  it("вчера — дата и время", () => {
    expect(formatFeedTime(new Date(2026, 10, 5, 14, 3), NOW)).toMatch(/^5 нояб\.?, 14:03$/)
  })
  it("граница полуночи: 23:59 вчера при «сейчас» 00:01 — это уже другой день", () => {
    expect(formatFeedTime(new Date(2026, 10, 5, 23, 59), new Date(2026, 10, 6, 0, 1))).toMatch(/^5 нояб/)
  })
  it("прошлый год — с годом", () => {
    const s = formatFeedTime(new Date(2025, 11, 31, 10, 0), new Date(2026, 0, 2, 12, 0))
    expect(s).toContain("2025")
    expect(s).toContain("31")
  })
})

describe("formatFeedTime: язык интерфейса", () => {
  it("по умолчанию русский, с локалью en — английские месяц и время", () => {
    const d = new Date(2026, 10, 5, 14, 3)
    expect(formatFeedTime(d, NOW)).toMatch(/нояб/)
    const en = formatFeedTime(d, NOW, "en")
    expect(en).toContain("Nov")
    expect(en).not.toMatch(/нояб/)
  })
  it("undefined вместо локали — тот же результат, что по умолчанию (стор мог не загрузиться)", () => {
    const d = new Date(2026, 10, 5, 14, 3)
    expect(formatFeedTime(d, NOW, undefined)).toBe(formatFeedTime(d, NOW))
  })
})
