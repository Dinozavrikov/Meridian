import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { formatFileSize, highlightToHtml, MAX_ATTACHMENT_MB, MAX_HIGHLIGHT_CHARS, CODE_LANGUAGE_OPTIONS } from "@/lib/attachments"

const t = (key: string, vars?: Record<string, string | number>) => `${key}:${vars?.n ?? ""}`

describe("formatFileSize", () => {
  it.each([
    [0, "attachmentsTab.sizeB:0"],
    [1023, "attachmentsTab.sizeB:1023"],
    [1024, "attachmentsTab.sizeKb:1"],
    [1536, "attachmentsTab.sizeKb:1.5"],
    [1024 * 1024, "attachmentsTab.sizeMb:1"],
    [10 * 1024 * 1024, "attachmentsTab.sizeMb:10"],
  ])("%i байт -> %s", (bytes, expected) => {
    expect(formatFileSize(bytes, t)).toBe(expected)
  })
})

describe("highlightToHtml", () => {
  it("подсвечивает python", async () => {
    const html = await highlightToHtml("def f(x):\n    return x\n", "python")
    expect(html).toContain("hljs-keyword")
  })

  it("экранирует недоверенное содержимое (нет живого <script>)", async () => {
    const html = await highlightToHtml('const s = "<script>alert(1)</script>"', "javascript")
    expect(html).not.toBeNull()
    expect(html).not.toContain("<script")
    expect(html).toContain("&lt;script&gt;")
  })

  it("алиасы tsx/jsx/toml поддержаны", async () => {
    for (const lang of ["tsx", "jsx", "toml"]) {
      expect(await highlightToHtml("x", lang)).not.toBeNull()
    }
  })

  it("null для неизвестного языка, отсутствия языка и служебных имён", async () => {
    expect(await highlightToHtml("x", "cobol")).toBeNull()
    expect(await highlightToHtml("x", null)).toBeNull()
    expect(await highlightToHtml("x", "constructor")).toBeNull()
    expect(await highlightToHtml("x", "__proto__")).toBeNull()
  })

  it("не подсвечивает слишком большой текст", async () => {
    expect(await highlightToHtml("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "python")).toBeNull()
  })
})

// Фронт обязан уметь подсветить каждый language, который бэкенд может отдать,
// и знать тот же лимит размера. Читаем сам бэкенд (монорепо) — рассинхрон
// (добавили расширение на бэке, забыли на фронте) ловится здесь, а не в браузере.
const BACKEND = path.resolve(process.cwd(), "../backend/app/services/attachment_storage.py")
const readBackend = () => readFileSync(BACKEND, "utf8")

// describe.skipIf всё равно выполняет тело describe при сборе тестов, поэтому файл
// бэкенда читаем только внутри it (сборка одного фронта без бэкенда не должна падать).
describe.skipIf(!existsSync(BACKEND))("соответствие бэкенду", () => {
  it("все language из CODE_EXTENSIONS / CODE_FILENAMES подсвечиваются", async () => {
    const src = readBackend()
    const block = src.slice(src.indexOf("CODE_EXTENSIONS"), src.indexOf("TEXT_DOC_MIME"))
    const langs = [...new Set([...block.matchAll(/"[\w.-]+":\s*"([\w-]+)"/g)].map(m => m[1]))]
    expect(langs.length).toBeGreaterThan(10)
    for (const lang of langs) {
      expect(await highlightToHtml("x", lang), `язык ${lang}`).not.toBeNull()
      expect(CODE_LANGUAGE_OPTIONS, `${lang} должен быть в CODE_LANGUAGE_OPTIONS для <select> при редактировании`).toContain(lang)
    }
  })

  it("MAX_ATTACHMENT_MB совпадает с бэкендом", () => {
    const m = readBackend().match(/MAX_ATTACHMENT_SIZE\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(MAX_ATTACHMENT_MB)
  })
})
