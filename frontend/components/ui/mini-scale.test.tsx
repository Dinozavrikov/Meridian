import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { DEFAULT_SCALES } from "@/lib/scales"
import { MiniScale } from "@/components/ui/mini-scale"

vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
afterEach(cleanup)

const LEVELS = DEFAULT_SCALES.find(s => s.id === "importance" && s.entity_type === "observation")!.levels
const mount = (value: number) =>
  render(<MiniScale name="Значимость" value={value} min={0} max={5} levels={LEVELS} color="#1ABC9C" />)
const filled = (c: HTMLElement) => c.querySelectorAll('[data-on="1"]').length

describe("MiniScale", () => {
  it("название уровня и столько заполненных делений, сколько оценка плюс нулевое", () => {
    const { container } = mount(3)
    expect(screen.getByText("Важное")).toBeTruthy()
    expect(container.querySelectorAll("[data-on]")).toHaveLength(6)
    expect(filled(container)).toBe(4)
  })

  it("нулевая оценка — тоже оценка: подпись «Незначительное» и одно деление", () => {
    const { container } = mount(0)
    expect(screen.getByText("Незначительное")).toBeTruthy()
    expect(filled(container)).toBe(1)
  })

  it("максимум закрашивает все деления; доступное имя содержит и шкалу, и уровень", () => {
    const { container } = mount(5)
    expect(filled(container)).toBe(6)
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Значимость: Ключевое")
  })
})
