import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { GROUP_KEYS, INVENTORY, TRACKS } from "@/lib/features-map"
import { STAGE_VALUES } from "@/lib/stage-labels"

const S = STRINGS as Record<string, string>
const keysLike = (re: RegExp) => Object.keys(S).filter(k => re.test(k)).sort()

const stageKeys = STAGE_VALUES.map(s => `featuresPage.stageHint.${s}`)
const invKeys = GROUP_KEYS.flatMap(g => INVENTORY[g].map(i => `featuresPage.inv.${i}.hint`))
const trackKeys = TRACKS.flatMap(tr => tr.steps.map(k => `featuresPage.track.${tr.key}.${k}.hint`))

describe("подсказки страницы Функции", () => {
  it("подсказка есть у каждой стадии, каждого пункта перечня и каждого шага сценария", () => {
    for (const k of [...stageKeys, ...invKeys, ...trackKeys]) expect(S[k]?.trim(), k).toBeTruthy()
  })
  it("лишних подсказок нет: каждая строка относится к существующей стадии, пункту или шагу", () => {
    expect(keysLike(/^featuresPage\.stageHint\./)).toEqual([...stageKeys].sort())
    expect(keysLike(/^featuresPage\.inv\..+\.hint$/)).toEqual([...invKeys].sort())
    expect(keysLike(/^featuresPage\.track\.[a-z]+\.[A-Za-z]+\.hint$/)).toEqual([...trackKeys].sort())
  })
  it("подсказка короткая и не повторяет видимый текст пункта", () => {
    for (const k of [...stageKeys, ...invKeys, ...trackKeys]) expect(S[k].length, k).toBeLessThanOrEqual(200)
    for (const k of invKeys) expect(S[k], k).not.toBe(S[k.replace(/\.hint$/, ".text")])
  })
  it("без буквы ё и без кавычек-палочек", () => {
    for (const k of [...stageKeys, ...invKeys, ...trackKeys]) expect(S[k], k).not.toMatch(/[ёЁ"]/)
  })
})
