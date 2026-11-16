import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { GROUP_KEYS, NODE_BY_KEY, membersOf } from "@/lib/features-map"
import { STAGE_VALUES } from "@/lib/stage-labels"
import { AI_ABILITIES, NEXT_STEPS, VISION, stageIndex } from "@/lib/roadmap"

const env = vi.hoisted(() => ({ user: null as null | { username: string } }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/store", () => ({ useStore: () => ({ user: env.user }) }))

import { RoadmapHero } from "./RoadmapHero"
import { RoadmapShipped } from "./RoadmapShipped"
import { RoadmapAI } from "./RoadmapAI"
import { RoadmapNext } from "./RoadmapNext"
import { RoadmapVision } from "./RoadmapVision"
import { RoadmapCta } from "./RoadmapCta"
import { RoadmapStageTrack } from "./RoadmapStageTrack"

const S = STRINGS as Record<string, string>
afterEach(() => { cleanup(); env.user = null })

// независимая от проекта проверка склонения: 1 функция, 2 функции, 5 функций, 11 функций, 21 функция
const word = (n: number) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? S["roadmapPage.shipped.countOne"] : [2, 3, 4].includes(a) && ![12, 13, 14].includes(b) ? S["roadmapPage.shipped.countFew"] : S["roadmapPage.shipped.countMany"]
}

describe("шапка", () => {
  it("слово-акцент выделено внутри заголовка, вопрос автора на стадии из данных", () => {
    const { container } = render(<RoadmapHero />)
    const h1 = container.querySelector("h1") as HTMLElement
    expect(h1.textContent).toBe(S["roadmapPage.hero.title"])
    expect(h1.querySelector("span")?.textContent).toBe(S["roadmapPage.hero.accent"])
    const card = container.querySelector("[data-author-question]") as HTMLElement
    expect(card.textContent).toContain(S["roadmapPage.item.physical.name"])
    expect(card.querySelector('[data-current="true"]')?.getAttribute("data-seg")).toBe("research")
  })
  it("про помидоры и десктоп на странице ни слова", () => {
    const { container } = render(<RoadmapHero />)
    expect(container.textContent?.toLowerCase()).not.toMatch(/помидор|десктоп/)
  })
})

describe("что уже работает", () => {
  it("на каждую колонку карты функций своя карточка: число функций, согласованное слово и все названия", () => {
    const { container } = render(<RoadmapShipped />)
    for (const g of GROUP_KEYS) {
      const card = container.querySelector(`[data-group="${g}"]`) as HTMLElement
      const keys = membersOf(g)
      expect(card.textContent, g).toContain(String(keys.length) + word(keys.length))
      for (const k of keys) expect(card.textContent, k).toContain(S[NODE_BY_KEY[k].nameKey] ?? NODE_BY_KEY[k].nameKey)
    }
  })
})

describe("ИИ-функции", () => {
  it("честно сказано, где работает ИИ, и показаны все функции", () => {
    const { container } = render(<RoadmapAI />)
    expect(container.querySelector("[data-ai-host]")?.textContent).toContain(S["roadmapPage.ai.host.text"])
    for (const a of AI_ABILITIES) expect(container.querySelector(`[data-ai="${a}"]`)?.textContent, a).toContain(S[`roadmapPage.ai.${a}.name`])
  })
})

describe("что дальше и видение", () => {
  it("шаги идут в заданном порядке, в конце цепочки федерация", () => {
    const { container } = render(<RoadmapNext />)
    const text = (container.querySelector("[data-order]") as HTMLElement).textContent as string
    const names = [...NEXT_STEPS.map(s => s.key), VISION.key].map(k => S[`roadmapPage.item.${k}.name`])
    const pos = names.map(n => text.indexOf(n))
    expect(pos.every(p => p >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(container.querySelectorAll("[data-entry]").length).toBe(NEXT_STEPS.length)
    expect(container.querySelector("[data-foundation]")?.textContent).toContain(S["roadmapPage.next.foundation.text"])
  })
  it("федерация: открытый вопрос и две схемы с подписями", () => {
    const { container } = render(<RoadmapVision />)
    expect(container.querySelector("[data-open]")?.textContent).toContain(S["roadmapPage.item.federation.open"])
    expect(container.querySelector('svg[data-topology="hub"]')?.getAttribute("aria-label")).toBe(S["roadmapPage.vision.nowCaption"])
    expect(container.querySelector('svg[data-topology="mesh"]')?.getAttribute("aria-label")).toBe(S["roadmapPage.vision.thenCaption"])
  })
})

describe("трек стадий", () => {
  it("закрашены деления до текущего включительно, текущее одно", () => {
    for (const stage of STAGE_VALUES) {
      const { container, unmount } = render(<RoadmapStageTrack stage={stage} />)
      const at = stageIndex(stage)
      STAGE_VALUES.forEach((s, i) => expect(container.querySelector(`[data-seg="${s}"]`)?.getAttribute("data-reached"), `${stage}:${s}`).toBe(String(i <= at)))
      expect(container.querySelectorAll('[data-current="true"]').length).toBe(1)
      unmount()
    }
  })
  it("наведение на деление показывает, что значит стадия", () => {
    const { container } = render(<RoadmapStageTrack stage="prototype" />)
    const seg = container.querySelector('[data-seg="evidence"]') as HTMLElement
    fireEvent.mouseEnter(seg)
    expect(screen.getByText(S["featuresPage.stageHint.evidence"])).toBeTruthy()
    fireEvent.mouseLeave(seg)
    expect(screen.queryByText(S["featuresPage.stageHint.evidence"])).toBeNull()
  })
})

describe("призыв внизу", () => {
  it("гость идет на регистрацию, вошедший в обзор", () => {
    const { container, rerender } = render(<RoadmapCta />)
    expect(container.querySelector("a.feat-cta--primary")?.getAttribute("href")).toBe("/register")
    env.user = { username: "x" }
    rerender(<RoadmapCta />)
    expect(container.querySelector("a.feat-cta--primary")?.getAttribute("href")).toBe("/dashboard")
  })
})
