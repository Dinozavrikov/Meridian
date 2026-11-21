import { describe, it, expect } from "vitest"
import { articleJsonLd } from "@/lib/seo-jsonld"
import { safeJsonLd } from "@/lib/json-ld"

const pub = { title: "Сколько нужно спать?", preview: "<p>Восемь часов?</p>", visibility: "public", created_at: "2026-11-01T10:00:00Z", author_username: "alex", author_display: "Алексей" }

describe("Article JSON-LD", () => {
  it("публичная запись: заголовок, описание, адрес и дата, без автора", () => {
    const j = articleJsonLd(pub, "question", "9")!
    expect(j["@type"]).toBe("Article")
    expect(j.headline).toBe("Сколько нужно спать?")
    expect(j.description).toBe("Восемь часов?")
    expect(j.mainEntityOfPage).toBe("https://miridin.com/feed/discussion/question/9")
    expect(j.datePublished).toBe("2026-11-01T10:00:00Z")
    expect(JSON.stringify(j)).not.toMatch(/alex|Алексей|author/)
  })

  it("убеждение без заголовка берет текст, заголовок не длиннее 110 символов", () => {
    const j = articleJsonLd({ ...pub, title: "", preview: `<p>${"а".repeat(300)}</p>` }, "worldview", "5")!
    expect(String(j.headline).length).toBeLessThanOrEqual(110)
  })

  it("непубличная и пустая запись разметки не получает", () => {
    expect(articleJsonLd({ ...pub, visibility: "private" }, "question", "9")).toBeNull()
    expect(articleJsonLd({ ...pub, title: "", preview: "" }, "question", "9")).toBeNull()
    expect(articleJsonLd(null, "question", "9")).toBeNull()
  })

  it("заголовок с закодированным </script> после сериализации не может закрыть тег", () => {
    // plain() раскодирует сущности: так "<" в заголовке и появляется после очистки тегов
    const j = articleJsonLd({ ...pub, title: "x &lt;/script&gt;&lt;b&gt;y" }, "question", "9")!
    expect(String(j.headline)).toContain("</script")
    expect(safeJsonLd(j)).not.toContain("<")
  })
})
