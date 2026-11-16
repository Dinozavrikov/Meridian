import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

let mobile = false
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => mobile }))
vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
afterEach(cleanup)

import { DetailPanel } from "@/components/layout/detail-panel"

describe("DetailPanel: не режет прилипание паспорта", () => {
  it("на десктопе нет overflow:hidden и фиксированной высоты: sticky внутри прилипает к окну", () => {
    mobile = false
    render(<DetailPanel accent="#fff"><div data-testid="c" /></DetailPanel>)
    const el = screen.getByTestId("c").parentElement!
    expect(el.style.overflow).not.toBe("hidden")
    expect(el.style.overflowY).not.toBe("hidden")
    expect(el.style.height).toBe("")
  })

  it("на мобильном деталь занимает экран и прокручивается внутри, как раньше", () => {
    mobile = true
    render(<DetailPanel accent="#fff"><div data-testid="c" /></DetailPanel>)
    const el = screen.getByTestId("c").parentElement!
    expect(el.style.overflow).toBe("hidden")
    expect(el.style.height).toBe("100%")
  })
})
