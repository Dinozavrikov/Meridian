import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { DateStamp } from "@/components/ui/date-stamp"
import { contrastRatio, cssRgbToHex } from "@/lib/color"

afterEach(cleanup)

describe("DateStamp", () => {
  it("день и время показаны крупно (12px) и читаемо (≥ 6:1) на карточке списка", () => {
    const { container } = render(<DateStamp raw="2026-10-12T10:41:00Z" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.fontSize).toBe("12px")
    const [day, , time] = Array.from(root.children) as HTMLElement[]
    expect(day.textContent).toMatch(/окт/)
    expect(time.textContent).toMatch(/^\d{2}:\d{2}$/)
    for (const el of [day, time]) expect(contrastRatio(cssRgbToHex(el.style.color) as string, "#141829")).toBeGreaterThanOrEqual(6)
  })

  it("без даты — ничего", () => {
    expect(render(<DateStamp />).container.firstChild).toBeNull()
  })
})
