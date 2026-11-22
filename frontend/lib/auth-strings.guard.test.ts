import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"

/**
 * Охранный тест: гость переводит строки страниц входа только из белого списка бэкенда (AUTH_UI_STRINGS),
 * и новая строка на странице без записи там молча остается без перевода. Заодно сверяется текст ответа 429.
 */
const backend = readFileSync(join(process.cwd(), "..", "backend/app/core/auth_ui_strings.py"), "utf-8")
const literals = (s: string) => [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => {
  try { return JSON.parse(`"${m[1]}"`) as string } catch { return m[1] }
})
const rate = backend.match(/^RATE_LIMIT_MESSAGE\s*=\s*"((?:[^"\\]|\\.)*)"/m)
const whitelist = new Set([...literals(backend.slice(backend.indexOf("frozenset({"))), ...(rate ? [rate[1]] : [])])

const PAGES = ["login", "register", "onboarding", "forgot-password", "reset-password"]
const source = (p: string) => readFileSync(join(process.cwd(), "app", "(auth)", p, "page.tsx"), "utf-8")
const block = (src: string) => src.match(/const PAGE_STRINGS = \[([\s\S]*?)\n\]/)?.[1] ?? ""

describe("строки страниц входа и белый список гостя", () => {
  it.each(PAGES)("%s: каждая строка страницы есть в белом списке бэкенда", p => {
    const strings = literals(block(source(p)))
    expect(strings.length).toBeGreaterThan(5)
    expect(strings.filter(s => !whitelist.has(s))).toEqual([])
  })

  it("текст 429 на фронтенде совпадает с бэкендом", () => {
    expect(rate).not.toBeNull()
    expect(RATE_LIMITED_MESSAGE).toBe(rate![1])
  })

  it.each(["login", "reset-password", "forgot-password"])("%s: сообщение о лимите переводимо и 429 обрабатывается отдельно", p => {
    const src = source(p)
    expect(block(src)).toContain("RATE_LIMITED_MESSAGE")
    expect(src).toMatch(/status === 429[\s\S]{0,80}dt\(RATE_LIMITED_MESSAGE\)/)
  })
})
