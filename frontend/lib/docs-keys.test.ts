// Ключи страницы документации: каждый нужный ключ есть, каждый ключ каркаса используется, порядок разделов совпадает с оглавлением.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { DATA_PREFIXES, SECTIONS } from "@/lib/docs"
import { walkSources } from "@/lib/test-utils/cyrillic-in-code"

const files = [...walkSources("components/docs"), ...walkSources("app/(app)/docs")].map(p => p.replaceAll("\\", "/"))
const src = files.map(p => readFileSync(p, "utf-8")).join("\n")
const literals = new Set([...src.matchAll(/["'`](docsPage\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'`]/g)].map(m => m[1]))
const templates = [...src.matchAll(/docsPage\.[A-Za-z0-9_.]*\.(?=\$\{)/g)].map(m => m[0])
const FORMS = ["One", "Few", "Many"]
const isForm = (k: string) => FORMS.some(f => k.endsWith(f) && literals.has(k.slice(0, -f.length)))

describe("ключи страницы документации", () => {
  it("каждый ключ каркаса где-то используется", () => {
    const chrome = Object.keys(STRINGS).filter(k => k.startsWith("docsPage.") && !DATA_PREFIXES.some(p => k.startsWith(p)))
    expect(chrome.filter(k => !(literals.has(k) || templates.some(p => k.startsWith(p)) || isForm(k)))).toEqual([])
  })
  it("в коде нет ссылок на несуществующие ключи", () => {
    expect([...literals].filter(l => !(l in STRINGS) && !FORMS.some(f => `${l}${f}` in STRINGS))).toEqual([])
  })
  it("разделы на странице идут в порядке оглавления", () => {
    const page = readFileSync("app/(app)/docs/page.tsx", "utf-8")
    expect([...page.matchAll(/<DocsSection id="(\w+)"/g)].map(m => m[1])).toEqual([...SECTIONS])
  })
})
