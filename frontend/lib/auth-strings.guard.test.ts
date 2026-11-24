import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GOOGLE_ERROR_MESSAGES, GOOGLE_ERROR_STRINGS, RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"

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

  it.each(["login", "register", "reset-password", "forgot-password"])("%s: сообщение о лимите переводимо и 429 обрабатывается отдельно", p => {
    const src = source(p)
    expect(block(src)).toContain("RATE_LIMITED_MESSAGE")
    expect(src).toMatch(/status === 429[\s\S]{0,80}dt\(RATE_LIMITED_MESSAGE\)/)
  })

  it.each(PAGES)("%s: каждый dt() со строковым литералом объявлен в PAGE_STRINGS", p => {
    const src = source(p)
    const declared = new Set(literals(block(src)))
    const used = [...src.matchAll(/\bdt\(\s*("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]) as string)
    expect(used.filter(s => !declared.has(s))).toEqual([])
  })

  it("сообщения об ошибках Google-входа есть в белом списке бэкенда и в PAGE_STRINGS страницы входа", () => {
    expect(GOOGLE_ERROR_STRINGS.filter(s => !whitelist.has(s))).toEqual([])
    expect(block(source("login"))).toContain("GOOGLE_ERROR_STRINGS")
  })

  it("каждый код google_error, который отдает бэкенд, известен фронтенду, и мертвых кодов нет", () => {
    const api = readFileSync(join(process.cwd(), "..", "backend/app/api/v1/auth.py"), "utf-8")
    const codes = [...new Set([...api.matchAll(/google_error=([a-z_]+)/g)].map(m => m[1]))]
    expect(codes.length).toBeGreaterThan(5)
    expect(codes.filter(c => !Object.prototype.hasOwnProperty.call(GOOGLE_ERROR_MESSAGES, c))).toEqual([])
    expect(Object.keys(GOOGLE_ERROR_MESSAGES).filter(c => !codes.includes(c))).toEqual([])
  })

  // Проверка по тексту (страницы забывания и сброса пароля поведенческим тестом пока не покрыты: у логина и регистрации он есть).
  it.each(["login", "register", "forgot-password", "reset-password"])("%s: логотип ведет на главную, а не на ленту", p => {
    const src = source(p)
    expect(src).toMatch(/<Link href="\/" /)
    expect(src).not.toMatch(/<Link href="\/feed"/)
  })
})
