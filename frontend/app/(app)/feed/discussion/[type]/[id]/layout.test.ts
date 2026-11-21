import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/feed-server", () => ({ fetchEntityCore: vi.fn() }))

import { fetchEntityCore } from "@/lib/feed-server"
import { generateMetadata } from "./layout"

const meta = (core: Record<string, unknown> | null, type = "worldview", id = "5") => {
  vi.mocked(fetchEntityCore).mockResolvedValue(core)
  return generateMetadata({ params: Promise.resolve({ type, id }) })
}

beforeEach(() => vi.mocked(fetchEntityCore).mockReset())

describe("метаданные страницы обсуждения", () => {
  it("публичное убеждение без заголовка индексируется, заголовок берется из текста", async () => {
    const m = await meta({ title: "", preview: "<p>Я верю, что память можно тренировать</p>", visibility: "public" })
    expect(m.robots).toBeUndefined()
    expect(String(m.title)).toContain("Я верю, что память")
    expect(m.alternates?.canonical).toBe("/feed/discussion/worldview/5")
  })

  it("описание и OpenGraph берутся из записи, есть siteName и twitter", async () => {
    const m = await meta({ title: "Вопрос про сон", preview: "<p>Сколько нужно спать?</p>", visibility: "public" }, "question", "9")
    expect(m.description).toBe("Сколько нужно спать?")
    expect(m.openGraph).toMatchObject({ siteName: "Meridian", url: "/feed/discussion/question/9" })
    expect(m.twitter).toMatchObject({ card: "summary_large_image" })
  })

  it("непубличная запись закрыта от индекса и не отдает свой текст", async () => {
    const m = await meta({ title: "Секрет", preview: "<p>тайный текст</p>", visibility: "private" })
    expect(m.robots).toMatchObject({ index: false })
    expect(JSON.stringify(m)).not.toContain("тайный")
    expect(m.alternates).toBeUndefined()
  })
})
