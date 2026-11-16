import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "@/lib/i18n/strings"
import { CALL_VARS, COOKIE_PURPOSES, DATA_KEYS, DATA_PREFIXES, formatTtl, ttlUnit } from "@/lib/privacy"

const t = (key: string, vars: Record<string, string | number> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? `?${key}`)
const privacyKeys = Object.keys(STRINGS).filter(k => k.startsWith("privacyPage."))
const backend = readFileSync(join(process.cwd(), "..", "backend/app/services/privacy_facts.py"), "utf-8")

describe("данные страницы приватности", () => {
  it("каждый нужный ключ существует", () => {
    expect(DATA_KEYS.filter(k => !(k in STRINGS))).toEqual([])
  })
  it("под префиксами данных нет лишних строк", () => {
    const extra = privacyKeys.filter(k => DATA_PREFIXES.some(p => k.startsWith(p)) && !DATA_KEYS.includes(k))
    expect(extra).toEqual([])
  })
  it("нет буквы ё и неизвестных подстановок", () => {
    expect(privacyKeys.filter(k => /[ёЁ]/.test(STRINGS[k]))).toEqual([])
    const known = new Set(CALL_VARS)
    const unknown = privacyKeys.flatMap(k => [...STRINGS[k].matchAll(/\{(\w+)\}/g)].map(m => `${k}:${m[1]}`).filter(x => !known.has(x.split(":")[1])))
    expect(unknown).toEqual([])
  })
  it("в тексте нет Яндекса и Метрики: их больше нет в продукте", () => {
    expect(privacyKeys.filter(k => /яндекс|метрик/i.test(STRINGS[k]))).toEqual([])
  })
  it("назначения кук совпадают с теми, что отдает бэкенд", () => {
    const fromBackend = [...backend.matchAll(/"purpose": "(\w+)"/g)].map(m => m[1])
    expect(fromBackend.sort()).toEqual([...COOKIE_PURPOSES].sort())
  })
})

describe("сроки", () => {
  it("делятся на самые крупные единицы", () => {
    expect(ttlUnit(900)).toEqual({ unit: "minute", n: 15 })
    expect(ttlUnit(3600)).toEqual({ unit: "hour", n: 1 })
    expect(ttlUnit(2592000)).toEqual({ unit: "day", n: 30 })
    expect(ttlUnit(90)).toEqual({ unit: "minute", n: 2 })
  })
  it.each([
    [60, "1 минута"], [120, "2 минуты"], [900, "15 минут"], [660, "11 минут"],
    [3600, "1 час"], [7200, "2 часа"], [18000, "5 часов"],
    [86400, "1 день"], [172800, "2 дня"], [2592000, "30 дней"],
  ])("%i секунд читаются как «%s»", (sec, text) => {
    expect(formatTtl(t, sec)).toBe(text)
  })
})
