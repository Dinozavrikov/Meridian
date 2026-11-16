import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { GROUP_KEYS, INVENTORY, TRACKS } from "@/lib/features-map"
import { STAGE_VALUES } from "@/lib/stage-labels"

const env = vi.hoisted(() => ({ mobile: false }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => env.mobile }))

import { FeatureStages } from "./FeatureStages"
import { FeatureTracks } from "./FeatureTracks"
import { FeatureInventory } from "./FeatureInventory"

const S = STRINGS as Record<string, string>
afterEach(() => { cleanup(); env.mobile = false })

const stageCase = STAGE_VALUES.map(s => ({ name: `стадия ${s}`, sel: `[data-stage="${s}"]`, hint: S[`featuresPage.stageHint.${s}`] }))
const invCase = GROUP_KEYS.flatMap(g => INVENTORY[g].map(i => ({ name: `пункт ${i}`, sel: `[data-inv="${i}"]`, hint: S[`featuresPage.inv.${i}.hint`] })))
const trackCase = TRACKS.flatMap(tr => tr.steps.map(k => ({ name: `шаг ${tr.key}:${k}`, sel: `[data-step="${tr.key}:${k}"]`, hint: S[`featuresPage.track.${tr.key}.${k}.hint`] })))

const SUITES = [
  { title: "стадии", Comp: FeatureStages, cases: stageCase },
  { title: "перечень", Comp: FeatureInventory, cases: invCase },
  { title: "шаги сценариев", Comp: FeatureTracks, cases: trackCase },
]

describe.each(SUITES)("подсказки: $title", ({ Comp, cases }) => {
  it("есть что показывать", () => { expect(cases.length).toBeGreaterThan(0) })

  it("наведение показывает расшифровку, уход скрывает, у каждого элемента она своя", () => {
    const { container } = render(<Comp />)
    for (const c of cases) {
      const el = container.querySelector(c.sel) as HTMLElement
      expect(el, c.name).toBeTruthy()
      expect(screen.queryByText(c.hint), c.name).toBeNull()
      fireEvent.mouseEnter(el)
      expect(screen.getAllByText(c.hint).length, c.name).toBe(1)
      fireEvent.mouseLeave(el)
      expect(screen.queryByText(c.hint), c.name).toBeNull()
    }
  })

  it("с клавиатуры: фокус показывает, Escape и уход фокуса скрывают", () => {
    const { container } = render(<Comp />)
    const c = cases[0]
    const el = container.querySelector(c.sel) as HTMLElement
    expect(el.getAttribute("tabindex")).toBe("0")
    fireEvent.focus(el)
    expect(screen.getByText(c.hint)).toBeTruthy()
    fireEvent.keyDown(el, { key: "Escape" })
    expect(screen.queryByText(c.hint)).toBeNull()
    fireEvent.focus(el)
    fireEvent.blur(el)
    expect(screen.queryByText(c.hint)).toBeNull()
  })

  it("на телефоне расшифровка видна сразу, а всплывающих подсказок нет", () => {
    env.mobile = true
    const { container } = render(<Comp />)
    for (const c of cases) expect(screen.getAllByText(c.hint).length, c.name).toBe(1)
    const el = container.querySelector(cases[0].sel) as HTMLElement
    fireEvent.mouseEnter(el)
    expect(screen.getAllByText(cases[0].hint).length).toBe(1)
    expect(container.querySelector("[tabindex]")).toBeNull()
  })
})
