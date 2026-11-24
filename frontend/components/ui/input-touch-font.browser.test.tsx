import { describe, it, expect, afterAll } from "vitest"
import { cdp } from "vitest/browser"
import { render } from "@testing-library/react"
import "@/app/globals.css"
import { Input, Textarea } from "@/components/ui/input"

// Реальный Chromium и настоящий globals.css: считается итоговый размер шрифта (getComputedStyle), а не текст правила.
// Сенсорный режим включается эмуляцией касаний через CDP: именно она дает (hover: none) and (pointer: coarse).
// Эмуляция действует на всю вкладку, поэтому afterAll выключает ее, а последний тест проверяет, что она не осталась.
const setTouch = (on: boolean) =>
  cdp().send("Emulation.setTouchEmulationEnabled", { enabled: on, maxTouchPoints: 1 })
const isTouch = () => matchMedia("(hover: none) and (pointer: coarse)").matches
const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)

function mountFields() {
  const { container } = render(
    <div>
      <Input placeholder="plain" />
      <Textarea placeholder="area" />
      <input data-inline="11" style={{ fontSize: 11 }} />
      <select data-inline="12" style={{ fontSize: 12 }}><option>a</option></select>
      <textarea data-inline="13" style={{ fontSize: 13 }} />
    </div>,
  )
  return [...container.querySelectorAll("input, textarea, select")]
}

describe("шрифт полей ввода", () => {
  afterAll(async () => { await setTouch(false) })

  it("мышь: размеры не меняются, инлайновые остаются как заданы, 16px правило не включается", () => {
    expect(isTouch()).toBe(false)
    const fields = mountFields()
    for (const el of fields) {
      const inline = (el as HTMLElement).dataset.inline
      if (inline) expect(px(el)).toBe(Number(inline))
      expect(px(el)).toBeLessThan(16)
    }
  })

  it("касание: все поля, включая Input, Textarea и поля с инлайновым размером, получают 16px", async () => {
    await setTouch(true)
    expect(isTouch()).toBe(true)
    const fields = mountFields()
    expect(fields.length).toBe(5)
    expect(fields.map(px)).toEqual([16, 16, 16, 16, 16])
  })

  it("эмуляция касания выключается и не остается для других файлов", async () => {
    await setTouch(false)
    expect(isTouch()).toBe(false)
  })
})
