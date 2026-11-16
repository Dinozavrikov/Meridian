import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { CALL_VARS, CARD_GROUPS, DATA_KEYS, DATA_PREFIXES, SECTIONS } from "@/lib/terms"

const termsKeys = Object.keys(STRINGS).filter(k => k.startsWith("termsPage."))

describe("данные страницы условий", () => {
  it("каждый нужный ключ существует", () => {
    expect(DATA_KEYS.filter(k => !(k in STRINGS))).toEqual([])
  })
  it("под префиксами данных нет лишних строк", () => {
    expect(termsKeys.filter(k => DATA_PREFIXES.some(p => k.startsWith(p)) && !DATA_KEYS.includes(k))).toEqual([])
  })
  it("нет буквы ё, квадратных заготовок и неизвестных подстановок", () => {
    expect(termsKeys.filter(k => /[ёЁ]/.test(STRINGS[k]))).toEqual([])
    expect(termsKeys.filter(k => /\[[^\]]*\]/.test(STRINGS[k]))).toEqual([])
    const known = new Set(CALL_VARS)
    const unknown = termsKeys.flatMap(k => [...STRINGS[k].matchAll(/\{(\w+)\}/g)].map(m => `${k}:${m[1]}`).filter(x => !known.has(x.split(":")[1])))
    expect(unknown).toEqual([])
  })
  it("группы карточек покрывают все разделы, кроме связи", () => {
    expect(Object.keys(CARD_GROUPS)).toEqual(SECTIONS.filter(s => s !== "contact"))
  })
  it("право российское, почта подставляется там, где о ней говорят", () => {
    expect(STRINGS["termsPage.contact.law"]).toContain("Российской Федерации")
    expect(STRINGS["termsPage.account.notify.text"]).toContain("{email}")
  })
  it("в условиях нет Яндекса и цитаты первого разработчика", () => {
    expect(termsKeys.filter(k => /яндекс|метрик|первый разработчик/i.test(STRINGS[k]))).toEqual([])
  })
})
