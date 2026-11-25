// Охрана текстов публичного сайта: нет утверждений, которых код не подтверждает или которые решено не делать,
// нет конструкции «не Х, а У», нет буквы с двумя точками.
import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"

const own = Object.entries(STRINGS as Record<string, string>).filter(([k]) => k.startsWith("sitePage."))

const FORBIDDEN: [RegExp, string][] = [
  [/шифр/i, "шифрование записей"],
  [/анонимн/i, "анонимность"],
  [/не покидают|не уходят|остаются на (нашем )?сервере/i, "данные не покидают сервер"],
  [/без\s+Meridian/i, "без Meridian проблему не решить"],
  [/лучше,? чем|быстрее,? чем|в отличие от|аналог/i, "сравнения с другими продуктами"],
  [/\u0451/, "буква с двумя точками"],
]
const NOT_BUT = /(^|[^а-я\u0451])не\s[^.!?;:]{1,70},\s*а\s/i

describe("тексты публичного сайта", () => {
  it("есть что проверять", () => expect(own.length).toBeGreaterThan(60))

  it("нет непроверенных утверждений и буквы с двумя точками", () => {
    const bad = own.flatMap(([k, v]) => FORBIDDEN.filter(([re]) => re.test(v)).map(([, why]) => `${k}: ${why}`))
    expect(bad).toEqual([])
  })

  it("нет конструкции «не Х, а У»", () => {
    expect(own.filter(([, v]) => NOT_BUT.test(v)).map(([k]) => k)).toEqual([])
  })

  it("сами проверки ловят нарушения и не трогают обычные фразы", () => {
    expect(FORBIDDEN.some(([re]) => re.test("Записи хранятся в зашифрованном виде"))).toBe(true)
    expect(FORBIDDEN.some(([re]) => re.test("Данные не покидают сервер"))).toBe(true)
    expect(NOT_BUT.test("Это не игра, а проверка реальностью")).toBe(true)
    expect(NOT_BUT.test("Пример для наглядности, не отзыв пользователя.")).toBe(false)
    expect(NOT_BUT.test("Так видно, где ваша интуиция точна, а где подводит")).toBe(false)
  })
})
