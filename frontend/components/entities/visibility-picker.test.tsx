import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { VisibilityPicker } from "@/components/entities/visibility-picker"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(cleanup)
const S = STRINGS as Record<string, string>

const mount = (over: Record<string, any> = {}) => {
  const onChange = vi.fn(); const onLabChange = vi.fn()
  render(<VisibilityPicker value="private" onChange={onChange} labId={null} onLabChange={onLabChange}
    labs={[{ id: 7, name: "Моя лаба" }]} accent="#1ABC9C" {...over} />)
  return { onChange, onLabChange }
}

describe("VisibilityPicker", () => {
  it("три варианта с описаниями; активный помечен", () => {
    mount()
    expect(screen.getByText(S["publishVis.public.desc"])).toBeTruthy()
    expect(screen.getByRole("button", { name: S["visibility.private"] }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: S["visibility.public"] }).getAttribute("aria-pressed")).toBe("false")
  })

  it("выбор варианта сообщает значение, а не-лабораторный сбрасывает лабораторию", () => {
    const { onChange, onLabChange } = mount({ value: "lab", labId: 7 })
    fireEvent.click(screen.getByRole("button", { name: S["visibility.public"] }))
    expect(onChange).toHaveBeenCalledWith("public")
    expect(onLabChange).toHaveBeenCalledWith(null)
  })

  it("список лабораторий только при «Лаборатория», выбор сообщает id", () => {
    mount()
    expect(screen.queryByRole("combobox")).toBeNull()
    cleanup()
    const { onLabChange } = mount({ value: "lab" })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } })
    expect(onLabChange).toHaveBeenCalledWith(7)
  })
})
