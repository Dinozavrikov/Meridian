import { describe, it, expect, vi } from "vitest"
import { stripHtml } from "@/lib/strip-html"

describe("stripHtml", () => {
  it("достаёт текст и декодирует сущности", () => {
    expect(stripHtml("<p>Привет <b>мир</b></p>")).toBe("Привет мир")
    expect(stripHtml("a &amp; b &lt;i&gt;")).toBe("a & b <i>")
    expect(stripHtml("")).toBe("")
  })

  it("<script> и <style> в начале строки в текст не попадают", () => {
    expect(stripHtml("<script>alert(1)</script>текст")).toBe("текст")
    expect(stripHtml("<style>p{color:red}</style>текст")).toBe("текст")
  })

  // jsdom не грузит картинки, поэтому «обработчик не сработал» здесь не доказать (проверяется в
  // браузере, см. консольную проверку в PR). Тест фиксирует механизм: разбор идёт не через
  // элемент живого документа, где <img onerror> срабатывает без вставки в DOM.
  it("не создаёт элементов в живом документе", () => {
    const spy = vi.spyOn(document, "createElement")
    stripHtml('<img src="x" onerror="window.__pwn=1">')
    expect(spy).not.toHaveBeenCalled()
  })

  it("без DOMParser (SSR) убирает теги регуляркой", () => {
    vi.stubGlobal("DOMParser", undefined)
    try {
      expect(stripHtml("<p>a</p><b>b</b>")).toBe("ab")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
