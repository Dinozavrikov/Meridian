import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { GROUP_KEYS, INVENTORY, NODE_BY_KEY, TRACKS } from "@/lib/features-map"

const S = STRINGS as Record<string, string>

describe("содержимое страницы функций", () => {
  it("шаги сценариев это существующие узлы карты", () => {
    for (const tr of TRACKS) {
      expect(tr.steps.length).toBeGreaterThan(1)
      for (const k of tr.steps) expect(NODE_BY_KEY[k], k).toBeDefined()
      expect(S[`featuresPage.track.${tr.key}.label`]?.trim(), tr.key).toBeTruthy()
      expect(S[`featuresPage.track.${tr.key}.q`]?.trim(), tr.key).toBeTruthy()
    }
  })
  it("у каждого пункта перечня есть название и описание, без повторов между колонками", () => {
    const all = GROUP_KEYS.flatMap(g => [...INVENTORY[g]])
    expect(new Set(all).size).toBe(all.length)
    for (const item of all) {
      expect(S[`featuresPage.inv.${item}.name`]?.trim(), item).toBeTruthy()
      expect(S[`featuresPage.inv.${item}.text`]?.trim(), item).toBeTruthy()
    }
  })
  it("в строках нет ключей, на которые никто не ссылается (лишнее не копится)", () => {
    const used = new Set<string>()
    for (const g of GROUP_KEYS) INVENTORY[g].forEach(i => { used.add(`featuresPage.inv.${i}.name`); used.add(`featuresPage.inv.${i}.text`); used.add(`featuresPage.inv.${i}.hint`) })
    const orphan = Object.keys(S).filter(k => k.startsWith("featuresPage.inv.") && !used.has(k))
    expect(orphan).toEqual([])
  })
})
