import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { DiffField } from "@/components/entities/history-diff"
import { contrastRatio, cssRgbToHex } from "@/lib/color"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(cleanup)

const S = STRINGS as Record<string, string>
const CARD = "#141829"
const ratio = (el: HTMLElement) => contrastRatio(cssRgbToHex(el.style.color) as string, CARD)

describe("DiffField: все тексты читаются на карточке истории (≥ 6:1) и не мельче 12px", () => {
  it("короткие значения: подпись, старое, стрелка, новое", () => {
    render(<DiffField label="Значимость" oldText="3" newText="0" />)
    for (const text of ["Значимость", "3", "0", "→"]) {
      const el = screen.getByText(text)
      expect(ratio(el)).toBeGreaterThanOrEqual(6)
      expect(parseInt(el.style.fontSize || "14", 10)).toBeGreaterThanOrEqual(12)
    }
  })

  it("длинные значения: блоки «Было» и «Стало» с подписями и текстом", () => {
    const oldText = Array(4).fill("старый длинный текст").join(" ")
    const newText = Array(4).fill("новый длинный текст").join(" ")
    render(<DiffField label="Текст" oldText={oldText} newText={newText} />)
    for (const text of [S["history.was"], S["history.became"], oldText, newText]) {
      expect(ratio(screen.getByText(text))).toBeGreaterThanOrEqual(6)
    }
  })
})
