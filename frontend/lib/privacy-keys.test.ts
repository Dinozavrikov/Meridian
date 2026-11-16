// Ключи страницы приватности: каждый ключ каркаса используется, ссылок на несуществующие ключи нет, порядок разделов совпадает с оглавлением.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { DATA_PREFIXES, SECTIONS } from "@/lib/privacy"
import { walkSources } from "@/lib/test-utils/cyrillic-in-code"

const files = [...walkSources("components/privacy"), ...walkSources("app/(app)/privacy"), "lib/privacy.ts"].map(p => p.replaceAll("\\", "/"))
const src = files.map(p => readFileSync(p, "utf-8")).join("\n")
const literals = new Set([...src.matchAll(/["'`](privacyPage\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'`]/g)].map(m => m[1]))
const templates = [...src.matchAll(/privacyPage\.[A-Za-z0-9_.]*\.(?=\$\{)/g)].map(m => m[0])

describe("ключи страницы приватности", () => {
  it("каждый ключ каркаса где-то используется", () => {
    const chrome = Object.keys(STRINGS).filter(k => k.startsWith("privacyPage.") && !DATA_PREFIXES.some(p => k.startsWith(p)))
    expect(chrome.filter(k => !(literals.has(k) || templates.some(p => k.startsWith(p))))).toEqual([])
  })
  it("в коде нет ссылок на несуществующие ключи", () => {
    expect([...literals].filter(l => !(l in STRINGS))).toEqual([])
  })
  it("разделы на странице идут в порядке оглавления", () => {
    const page = readFileSync("app/(app)/privacy/page.tsx", "utf-8")
    expect([...page.matchAll(/<PrivacySection id="(\w+)"/g)].map(m => m[1])).toEqual([...SECTIONS])
  })
})
