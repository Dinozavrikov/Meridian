// Песочница на главной: пробелы, шкала уверенности и файл для экспорта.
import { describe, expect, it } from "vitest"
import { GAP_IDS, SANDBOX_KEYS as K, buildMarkdown, confidenceBounds, edgeOf, exportFileName, gapKeys, isRealDate, localDate, missingGaps, type SandboxDraft } from "@/lib/site/sandbox"

const EMPTY: SandboxDraft = { claim: "", confidence: null, source: "", refutation: "", deadline: "" }
const FULL: SandboxDraft = { claim: "Угол сыреет из-за вентиляции", confidence: 70, source: "Замерил влажность", refutation: "Влажность не изменится после проветривания", deadline: "2027-01-31" }
// Часовой пояс восточнее UTC: местная дата уже 26 ноября, а по UTC еще 25-е.
const EASTERN_MIDNIGHT = Object.assign(new Date(Date.UTC(2026, 10, 25, 21, 30)), { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 26 })
// Переводы подменены ключами с переменными: проверяется структура файла, а не текст.
const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}|${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(",")}` : key)
const B = { min: 5, max: 95 }
const MODEL = (floor: unknown, ceil: unknown, def: unknown) => ({ prediction: { confidence_floor_pct: floor, confidence_ceil_pct: ceil, default_confidence: def } })

describe("песочница: пробелы", () => {
  it("пустой черновик не заполнен ни в одном поле", () => {
    expect(missingGaps(EMPTY)).toEqual([...GAP_IDS])
  })
  it("пробельные и пустые поля не засчитываются", () => {
    expect(missingGaps({ ...FULL, source: "   \n ", refutation: "" })).toEqual(["source", "refutation"])
  })
  it("заполненный черновик пробелов не имеет", () => {
    expect(missingGaps(FULL)).toEqual([])
  })
  it("несуществующая дата не засчитывается", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "26.11.2026", "2026-1-5", ""]) {
      expect(isRealDate(bad)).toBe(false)
      expect(missingGaps({ ...FULL, deadline: bad })).toEqual(["deadline"])
    }
    expect(isRealDate("2028-02-29")).toBe(true)
  })
})

describe("песочница: шкала уверенности", () => {
  it("граница шкалы уже считается краем", () => {
    expect(edgeOf(5, B)).toBe("low")
    expect(edgeOf(95, B)).toBe("high")
    expect(edgeOf(6, B)).toBeNull()
    expect(edgeOf(94, B)).toBeNull()
  })
  it("пока уверенность не выбрана или границ нет, края нет", () => {
    expect(edgeOf(null, B)).toBeNull()
    expect(edgeOf(5, null)).toBeNull()
  })
  it("границы берутся только из полной модели", () => {
    expect(confidenceBounds(MODEL(5, 95, 60))).toEqual({ min: 5, max: 95, initial: 60 })
    for (const bad of [undefined, null, {}, { prediction: {} }, MODEL(5, 95, undefined), MODEL(95, 95, 60), MODEL(NaN, 95, 60), MODEL("5", 95, 60)]) {
      expect(confidenceBounds(bad)).toBeNull()
    }
  })
  it("начальная уверенность не выходит за границы модели", () => {
    expect(confidenceBounds(MODEL(5, 95, 150))?.initial).toBe(95)
    expect(confidenceBounds(MODEL(5, 95, 1))?.initial).toBe(5)
  })
})

describe("песочница: файл", () => {
  it("дата экспорта берется по местному времени", () => {
    expect(localDate(EASTERN_MIDNIGHT)).toBe("2026-11-26")
    expect(exportFileName(EASTERN_MIDNIGHT)).toBe("idea-check-2026-11-26.md")
    expect(buildMarkdown(FULL, t, EASTERN_MIDNIGHT)).toContain(`${K.mdExported}|date=2026-11-26`)
  })
  it("разделы файла идут по порядку и содержат введенное", () => {
    const md = buildMarkdown(FULL, t, EASTERN_MIDNIGHT)
    const order = [K.mdTitle, K.mdClaim, K.mdConfidence, K.mdSource, K.mdRefutation, K.mdDeadline, K.mdMissing, K.mdExported].map(k => md.indexOf(k))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(md).toContain(`## ${K.mdClaim}\n\n${FULL.claim}\n`)
    expect(md).toContain(`## ${K.mdSource}\n\n${FULL.source}\n`)
    expect(md).toContain(`## ${K.mdRefutation}\n\n${FULL.refutation}\n`)
    expect(md).toContain(`## ${K.mdDeadline}\n\n${FULL.deadline}\n`)
    expect(md).toContain(`## ${K.mdConfidence}\n\n${K.confidenceValue}|pct=70\n`)
  })
  it("пока уверенность не выбрана, ее нет в файле", () => {
    const md = buildMarkdown({ ...FULL, confidence: null }, t, EASTERN_MIDNIGHT)
    expect(md).not.toContain(K.mdConfidence)
    expect(md).not.toContain("null")
  })
  it("пустые поля заменены пометкой, в списке только незаполненное", () => {
    const md = buildMarkdown({ ...EMPTY, claim: "Идея" }, t, EASTERN_MIDNIGHT)
    expect(md).toContain(`## ${K.mdSource}\n\n${K.mdNone}`)
    for (const id of GAP_IDS) expect(md).toContain(`- ${gapKeys(id).label}: ${gapKeys(id).question}`)
    const full = buildMarkdown(FULL, t, EASTERN_MIDNIGHT)
    expect(full).toContain(`## ${K.mdMissing}\n\n${K.mdNothingMissing}`)
    expect(full).not.toContain("- sitePage.home.sandbox.gap")
  })
  it("текст в несколько строк сохраняется как есть", () => {
    const claim = "Первая строка\n\nвторая строка"
    expect(buildMarkdown({ ...FULL, claim }, t, EASTERN_MIDNIGHT)).toContain(`## ${K.mdClaim}\n\n${claim}\n`)
  })
})
