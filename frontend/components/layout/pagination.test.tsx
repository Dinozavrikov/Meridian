import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { PaginationBar } from "@/components/layout/pagination"
import { contrastRatio, cssRgbToHex } from "@/lib/color"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
afterEach(cleanup)

const S = STRINGS as Record<string, string>
const mount = (page: number, onPageChange = vi.fn()) => {
  render(<PaginationBar total={41} page={page} pageSize={6} pageCount={7} onPageChange={onPageChange} />)
  return onPageChange
}
const prev = () => screen.getByRole("button", { name: S["pagination.prev"] }) as HTMLButtonElement
const next = () => screen.getByRole("button", { name: S["pagination.next"] }) as HTMLButtonElement

describe("PaginationBar", () => {
  it("показывает диапазон и общее число", () => {
    mount(0)
    expect(screen.getByText(/1.6.*41/)).toBeTruthy()
    cleanup()
    mount(6)
    expect(screen.getByText(/37.41.*41/)).toBeTruthy()
  })

  it("на первой странице «назад» недоступна, «вперёд» ведёт на следующую", () => {
    const onPage = mount(0)
    expect(prev().disabled).toBe(true)
    fireEvent.click(next())
    expect(onPage).toHaveBeenCalledWith(1)
  })

  it("на последней странице «вперёд» недоступна, «назад» ведёт на предыдущую", () => {
    const onPage = mount(6)
    expect(next().disabled).toBe(true)
    fireEvent.click(prev())
    expect(onPage).toHaveBeenCalledWith(5)
  })

  it("цифры читаемы на тёмном фоне, а недоступная кнопка гасится цветом, а не прозрачностью", () => {
    mount(0)
    const label = screen.getByText(/1.6.*41/) as HTMLElement
    expect(contrastRatio(cssRgbToHex(label.style.color) as string, "#0b0d14")).toBeGreaterThanOrEqual(4.5)
    expect(prev().style.opacity).toBe("")
  })
})
