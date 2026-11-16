import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { STAGE_VALUES } from "@/lib/stage-labels"
import { NODE_BY_KEY } from "@/lib/features-map"
import { walkSources } from "@/lib/test-utils/cyrillic-in-code"
import { AI_ABILITIES, ENTRIES, FOUNDATION_NODE, NEXT_STEPS, VISION, stageIndex } from "@/lib/roadmap"

const S = STRINGS as Record<string, string>
const idx = (key: string) => stageIndex(ENTRIES.find(e => e.key === key)!.stage)

const derived = new Set([
  ...ENTRIES.flatMap(e => [`roadmapPage.item.${e.key}.name`, `roadmapPage.item.${e.key}.text`]),
  ...AI_ABILITIES.flatMap(a => [`roadmapPage.ai.${a}.name`, `roadmapPage.ai.${a}.text`]),
  ...["One", "Few", "Many"].map(f => `roadmapPage.shipped.count${f}`),
  // ключи, которые компоненты собирают из шаблонов
  `roadmapPage.item.${VISION.key}.open`,
  ...["now", "then"].flatMap(k => [`roadmapPage.vision.${k}`, `roadmapPage.vision.${k}Caption`]),
])

describe("дорожная карта: данные", () => {
  it("ключи записей уникальны, стадии настоящие, у каждой записи есть название и текст", () => {
    expect(new Set(ENTRIES.map(e => e.key)).size).toBe(ENTRIES.length)
    for (const e of ENTRIES) {
      expect(STAGE_VALUES as readonly string[], e.key).toContain(e.stage)
      expect(S[`roadmapPage.item.${e.key}.name`]?.trim(), e.key).toBeTruthy()
      expect(S[`roadmapPage.item.${e.key}.text`]?.trim(), e.key).toBeTruthy()
    }
    expect(S[`roadmapPage.item.${VISION.key}.open`]?.trim()).toBeTruthy()
  })
  it("федерация не зрелее слияния, слияние не зрелее форка: каждый шаг опирается на предыдущий", () => {
    expect(NEXT_STEPS.map(s => s.key).slice(1)).toEqual(["fork", "merge"])
    expect(idx("federation")).toBeLessThanOrEqual(idx("merge"))
    expect(idx("merge")).toBeLessThanOrEqual(idx("fork"))
  })
  it("для каждой ИИ-функции есть название и описание, а фундамент это существующий узел карты", () => {
    for (const a of AI_ABILITIES) {
      expect(S[`roadmapPage.ai.${a}.name`]?.trim(), a).toBeTruthy()
      expect(S[`roadmapPage.ai.${a}.text`]?.trim(), a).toBeTruthy()
    }
    expect(NODE_BY_KEY[FOUNDATION_NODE]).toBeDefined()
  })
  it("в строках нет лишнего: каждый ключ roadmapPage.* используется в коде страницы или выводится из данных", () => {
    const src = [...walkSources("components/roadmap"), "app/(app)/roadmap/page.tsx"].map(p => readFileSync(p, "utf-8")).join("\n")
    const orphan = Object.keys(S).filter(k => k.startsWith("roadmapPage.") && !derived.has(k) && !src.includes(k))
    expect(orphan).toEqual([])
  })
  it("без буквы ё и без кавычек-палочек, обещаний с датами и слов про токен или DAO", () => {
    for (const [k, v] of Object.entries(S).filter(([k]) => k.startsWith("roadmapPage."))) {
      expect(v, k).not.toMatch(/[ёЁ"]/)
      expect(v.toLowerCase(), k).not.toMatch(/dao|токен|помидор|десктоп|202\d/)
    }
  })
})
