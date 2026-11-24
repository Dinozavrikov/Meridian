import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
afterEach(cleanup)

import { GuestSidebar } from "@/components/layout/guest-sidebar"

describe("GuestSidebar", () => {
  it("логотип ведет на главную", () => {
    const { container } = render(<GuestSidebar />)
    const logo = container.querySelector('a[href="/"]')
    expect(logo, "логотип").not.toBeNull()
    expect(logo!.textContent).toContain("MER")
  })
})
