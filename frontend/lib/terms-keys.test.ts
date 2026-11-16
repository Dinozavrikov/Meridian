// Ключи страниц условий и общих правовых компонентов: каждый ключ каркаса используется, ссылок на несуществующие ключи нет.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { DATA_PREFIXES, SECTIONS } from "@/lib/terms"
import { walkSources } from "@/lib/test-utils/cyrillic-in-code"

const read = (paths: string[]) => paths.map(p => readFileSync(p.replaceAll("\\", "/"), "utf-8")).join("\n")
const used = (prefix: string, src: string) => new Set([...src.matchAll(new RegExp(`["'\`](${prefix}\\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'\`]`, "g"))].map(m => m[1]))

const termsSrc = read([...walkSources("components/terms"), ...walkSources("app/(app)/terms"), "lib/terms.ts"])
const legalSrc = read([...walkSources("components/legal"), ...walkSources("components/privacy"), ...walkSources("app/(app)/privacy"), ...walkSources("components/terms"), ...walkSources("app/(app)/terms")])

describe("ключи страницы условий", () => {
  const literals = used("termsPage", termsSrc)
  it("каждый ключ каркаса где-то используется", () => {
    const chrome = Object.keys(STRINGS).filter(k => k.startsWith("termsPage.") && !DATA_PREFIXES.some(p => k.startsWith(p)))
    expect(chrome.filter(k => !literals.has(k))).toEqual([])
  })
  it("в коде нет ссылок на несуществующие ключи", () => {
    expect([...literals].filter(l => !(l in STRINGS))).toEqual([])
  })
  it("разделы идут в порядке оглавления", () => {
    const body = readFileSync("components/terms/TermsBody.tsx", "utf-8")
    expect([...body.matchAll(/<TermsSection id="(\w+)"/g)].map(m => m[1])).toEqual([...SECTIONS])
  })
})

describe("общие ключи правовых страниц (legalPage.*)", () => {
  const literals = used("legalPage", legalSrc)
  it("все существуют и все используются", () => {
    expect([...literals].filter(l => !(l in STRINGS))).toEqual([])
    expect(Object.keys(STRINGS).filter(k => k.startsWith("legalPage.") && !literals.has(k))).toEqual([])
  })
})
