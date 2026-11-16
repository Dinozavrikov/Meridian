// Охранный тест страницы документации: данные полны, строки чистые, числа не вписаны руками,
// состав формулы и выгрузки совпадает с бэкендом.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "@/lib/i18n/strings"
import { NODE_BY_KEY } from "@/lib/features-map"
import { STAGE_VALUES } from "@/lib/stage-labels"
import {
  CALL_VARS, DATA_PREFIXES, EXPORT_KEYS, FAQ_IDS, FORMULA_TERM_IDS, MODEL_VARS, RECORD_KEYS, SECTIONS, STEP_IDS, STEP_NODE, docsDataKeys,
} from "@/lib/docs"

const docsKeys = Object.keys(STRINGS).filter(k => k.startsWith("docsPage."))
const backend = (rel: string) => readFileSync(join(process.cwd(), "..", "backend", rel), "utf-8")

describe("страница документации: данные и ключи", () => {
  it("каждый ключ, нужный данным, есть в словаре", () => {
    expect(docsDataKeys().filter(k => !(k in STRINGS))).toEqual([])
  })
  it("в выводимых из данных пространствах нет лишних ключей", () => {
    const derived = new Set(docsDataKeys())
    expect(docsKeys.filter(k => DATA_PREFIXES.some(p => k.startsWith(p)) && !derived.has(k))).toEqual([])
  })
  it("идентификаторы не повторяются", () => {
    for (const list of [SECTIONS, STEP_IDS, FAQ_IDS, FORMULA_TERM_IDS, EXPORT_KEYS]) expect(new Set(list).size).toBe(list.length)
  })
  it("быстрый старт и виды записей опираются на узлы карты функций", () => {
    for (const id of STEP_IDS) expect(NODE_BY_KEY[STEP_NODE[id]], id).toBeTruthy()
    for (const k of RECORD_KEYS) {
      expect(NODE_BY_KEY[k].nameKey in STRINGS, k).toBe(true)
      expect(NODE_BY_KEY[k].textKey in STRINGS, k).toBe(true)
    }
  })
  it("у каждой стадии есть подсказка (общая с картой функций)", () => {
    for (const s of STAGE_VALUES) expect(`featuresPage.stageHint.${s}` in STRINGS, s).toBe(true)
  })
})

describe("страница документации: состав сверен с бэкендом", () => {
  it("члены формулы совпадают с FORMULA_TERMS", () => {
    const m = backend("app/services/maturity_model.py").match(/FORMULA_TERMS = \(([^)]*)\)/)
    expect(m, "FORMULA_TERMS не найден").toBeTruthy()
    const ids = [...m![1].matchAll(/"(\w+)"/g)].map(x => x[1])
    expect([...ids].sort()).toEqual([...FORMULA_TERM_IDS].sort())
  })
  it("состав выгрузки совпадает с ключами export_my_data", () => {
    const src = backend("app/api/v1/users.py")
    const from = src.indexOf("async def export_my_data")
    const body = src.slice(from, src.indexOf("return data", from))
    const keys = [...body.matchAll(/^ {8}"(\w+)":/gm)].map(x => x[1])
    const technical = new Set(["exported_at", "user", "entity_tags"])
    expect(keys.filter(k => !technical.has(k)).sort()).toEqual([...EXPORT_KEYS].sort())
  })
})

describe("страница документации: чистота строк", () => {
  it("нет буквы «ё»", () => {
    expect(docsKeys.filter(k => /ё/i.test(STRINGS[k]))).toEqual([])
  })
  it("числа не вписаны руками: только плейсхолдеры и структурная единица", () => {
    const bad = docsKeys.filter(k => /\d/.test(STRINGS[k].replace(/\{[A-Za-z0-9]+\}/g, "").replace(/\b1\b/g, "")))
    expect(bad).toEqual([])
  })
  it("все плейсхолдеры известны странице", () => {
    const allowed = new Set<string>([...MODEL_VARS, ...CALL_VARS])
    const bad = docsKeys.flatMap(k => [...STRINGS[k].matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(n => !allowed.has(n)).map(n => `${k}: {${n}}`))
    expect(bad).toEqual([])
  })
})
