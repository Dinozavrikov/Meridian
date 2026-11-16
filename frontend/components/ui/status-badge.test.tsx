import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { statusColor } from "@/lib/theme"
import { StatusBadge } from "@/components/ui/status-badge"
import { contrastRatio, cssRgbToHex } from "@/lib/color"

vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
afterEach(cleanup)

const textColor = (status: string) => {
  const { container } = render(<StatusBadge status={status} />)
  return cssRgbToHex((container.firstElementChild as HTMLElement).style.color) as string
}

describe("StatusBadge: текст каждого статуса читается на тёмном фоне", () => {
  it.each(Object.keys(statusColor))("«%s»", (status) => {
    expect(contrastRatio(textColor(status), "#0b0d14")).toBeGreaterThanOrEqual(4.5)
  })

  it("неизвестный статус (цвет по умолчанию) — тоже", () => {
    expect(contrastRatio(textColor("какой-то новый"), "#0b0d14")).toBeGreaterThanOrEqual(4.5)
  })

  it("показывает текст статуса", () => {
    const { getByText } = render(<StatusBadge status="осмысленное" fontSize={12} />)
    expect(getByText("осмысленное")).toBeTruthy()
  })
})
