import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Eye } from "lucide-react"
import { STRINGS } from "@/lib/i18n/strings"
import { QuickAddHeader } from "@/components/entities/forms/quick-add-header"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>
const label = (key: string) => S[key] ?? key
afterEach(cleanup)

// какие из трёх чипов типа связи реально показаны (кнопки родительской модалки не считаем)
const shownChips = () => ["linkType.confirms", "linkType.refutes", "linkType.related"]
  .filter(k => screen.queryByRole("button", { name: label(k) }))

const renderHeader = (entityType: string | undefined, targetType: string) =>
  render(<QuickAddHeader entityType={entityType} targetType={targetType} targetLabel="Цель" icon={Eye} linkType="связано" onLinkTypeChange={() => {}} />)

describe("QuickAddHeader", () => {
  it("разные типы: три типа связи и без подсказки", () => {
    renderHeader("observation", "hypothesis")
    expect(shownChips()).toEqual(["linkType.confirms", "linkType.refutes", "linkType.related"])
    expect(screen.queryByText(label("quickAdd.sameTypeNeutral"))).toBeNull()
  })
  it("один тип: только «Связано» и подсказка, почему", () => {
    renderHeader("hypothesis", "hypothesis")
    expect(shownChips()).toEqual(["linkType.related"])
    expect(screen.getByText(label("quickAdd.sameTypeNeutral"))).toBeTruthy()
  })
  it("пара с убеждением: четыре влияния и «Связано», без доказательных и без подсказки", () => {
    renderHeader("hypothesis", "worldview")
    for (const i of WORLDVIEW_INFLUENCE) expect(screen.queryByRole("button", { name: S[i.labelKey] })).not.toBeNull()
    expect(shownChips()).toEqual(["linkType.related"])
    expect(screen.queryByText(label("quickAdd.sameTypeNeutral"))).toBeNull()
  })
  it("без entityType поведение прежнее: три типа связи", () => {
    renderHeader(undefined, "hypothesis")
    expect(shownChips()).toEqual(["linkType.confirms", "linkType.refutes", "linkType.related"])
  })
})
