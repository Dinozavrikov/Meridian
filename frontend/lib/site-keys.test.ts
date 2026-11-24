// Ключи публичного сайта: каждый ключ sitePage.* используется, ссылок на несуществующие ключи нет, данные из lib/site/home.ts имеют тексты.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { DATA_KEYS } from "@/lib/site/home"
import { walkSources } from "@/lib/test-utils/cyrillic-in-code"

const files = [...walkSources("components/site"), ...walkSources("app/(site)"), ...walkSources("lib/site")].map(p => p.replaceAll("\\", "/"))
const src = files.map(p => readFileSync(p, "utf-8")).join("\n")
const literals = new Set([...src.matchAll(/["'`](sitePage\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'`]/g)].map(m => m[1]))
const templates = [...src.matchAll(/sitePage\.[A-Za-z0-9_.]*\.(?=\$\{)/g)].map(m => m[0])
const own = Object.keys(STRINGS).filter(k => k.startsWith("sitePage."))

describe("ключи публичного сайта", () => {
  it("список файлов не усох", () => expect(files.length).toBeGreaterThanOrEqual(6))
  it("каждый ключ sitePage.* где-то используется", () => {
    expect(own.length).toBeGreaterThan(10)
    expect(own.filter(k => !(literals.has(k) || templates.some(p => k.startsWith(p))))).toEqual([])
  })
  it("в коде нет ссылок на несуществующие ключи", () => {
    expect([...literals].filter(l => !(l in STRINGS))).toEqual([])
  })
  it("данные из lib/site/home.ts имеют тексты", () => {
    expect(DATA_KEYS.filter(k => !(k in STRINGS))).toEqual([])
  })
})
