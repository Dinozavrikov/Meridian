import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Ruler } from "@/components/ui/ruler"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => key }))

const alphaOf = (css: string): number => {
  const m = /rgba\([^)]*,\s*([\d.]+)\)\s*$/.exec(css.trim())
  return m ? Number(m[1]) : 1 // rgb(...) без альфы — непрозрачный
}
const detail = (value: number | null) => (
  <Ruler variant="detail" name="s" value={value} min={0} max={4} step={1} color="#4A90D9" />
)

describe("детальная шкала", () => {
  it("числа на делениях читаемы: непройденные не прозрачнее 0.4", () => {
    render(detail(null))
    for (const n of ["0", "1", "2", "3", "4"]) {
      const css = screen.getByText(n).style.color
      expect(css, `цвет числа ${n}`).not.toBe("")                   // jsdom разобрал цвет: проверка не пустая
      expect(alphaOf(css), `прозрачность числа ${n}`).toBeGreaterThanOrEqual(0.4)
    }
  })

  it("текущее значение выделено цветом шкалы, непройденные остаются читаемыми", () => {
    render(detail(2))
    expect(screen.getByText("2").style.color).toBe("rgb(74, 144, 217)")
    expect(alphaOf(screen.getByText("4").style.color)).toBeGreaterThanOrEqual(0.4)
  })

  it("по краям есть воздух: крайние деления и числа не прижаты к границе контейнера", () => {
    const { container } = render(detail(null))
    const margin = (container.firstElementChild as HTMLElement).style.margin.split(/\s+/)
    expect(parseFloat(margin[1])).toBeGreaterThanOrEqual(16)        // «вертикаль горизонталь низ»: вторая часть — боковой отступ
  })
})
