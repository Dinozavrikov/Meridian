import { describe, it, expect } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { typeColor } from "@/lib/theme"
import { SITE_NAME } from "@/lib/page-meta"
import { ogCard } from "@/lib/og-card"

const S = STRINGS as Record<string, string>

describe("картинка записи для соцсетей", () => {
  it("публичная запись: заголовок, подпись типа и цвет типа", () => {
    const c = ogCard({ title: "Сколько нужно спать?", preview: "<p>текст</p>", visibility: "public" }, "question")
    expect(c.title).toBe("Сколько нужно спать?")
    expect(c.label).toBe(S["entityType.question"])
    expect(c.color).toBe(typeColor.question)
  })

  it("убеждение без заголовка берет текст", () => {
    const c = ogCard({ title: "", preview: "<p>Я верю, что память можно тренировать</p>", visibility: "public" }, "worldview")
    expect(c.title).toBe("Я верю, что память можно тренировать")
  })

  it("непубличная и несуществующая запись: только бренд, чужого текста нет", () => {
    const secret = ogCard({ title: "Секрет", preview: "<p>тайный текст</p>", visibility: "private" }, "observation")
    expect(secret.title).toBe(SITE_NAME)
    expect(secret.label).toBe("")
    expect(JSON.stringify(secret)).not.toContain("тайн")
    expect(ogCard(null, "observation").title).toBe(SITE_NAME)
  })

  it("длинный заголовок обрезается многоточием, шрифт для него мельче", () => {
    const long = ogCard({ title: "а".repeat(400), preview: "", visibility: "public" }, "hypothesis")
    const short = ogCard({ title: "Коротко", preview: "", visibility: "public" }, "hypothesis")
    expect(long.title.length).toBeLessThanOrEqual(150)
    expect(long.title.endsWith("…")).toBe(true)
    expect(long.fontSize).toBeLessThan(short.fontSize)
  })
})
