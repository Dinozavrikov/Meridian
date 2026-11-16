import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { page } from "vitest/browser"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import "@/app/globals.css"
import { ConvEntry, CONV_COLUMN_MAX_WIDTH } from "./conv-entry"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})

// Реальный Chromium + настоящий globals.css: проверяем геометрию, а не строки в CSS.
// Линия таймлайна — .conv-thread::before на left:50%; колонка сообщений центрирована в треде,
// поэтому центр треда = x линии.
const GAP = 10 // точка на линии ~7px + запас; в CSS зазор 18px
const LONG = "длинное слово ".repeat(80)
const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

beforeEach(async () => {
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height)
})
afterEach(() => { cleanup() })

function mount(mine: boolean, props: Partial<React.ComponentProps<typeof ConvEntry>> = {}) {
  const { container } = render(
    <div className="conv-thread" style={{ padding: "24px 24px 16px" }}>
      <div style={{ maxWidth: CONV_COLUMN_MAX_WIDTH, margin: "0 auto" }}>
        <ConvEntry mine={mine} authorName="Автор" authorHref="/profile/a" time="10:21" text="Привет" {...props} />
      </div>
    </div>,
  )
  const thread = container.querySelector(".conv-thread") as HTMLElement
  const bubble = container.querySelector(".conv-entry") as HTMLElement
  const row = container.querySelector(".conv-entry-row") as HTMLElement
  const t = thread.getBoundingClientRect()
  return { thread, bubble, row, lineX: t.left + t.width / 2, container }
}

function expectOnOwnSide(mine: boolean, bubble: HTMLElement, lineX: number) {
  const b = bubble.getBoundingClientRect()
  if (mine) expect(b.left).toBeGreaterThanOrEqual(lineX + GAP)
  else expect(b.right).toBeLessThanOrEqual(lineX - GAP)
}

describe.each([true, false])("пузырь не заходит за центральную линию (mine=%s)", (mine) => {
  it("развёрнутый ролик YouTube: в своей половине и не сжат", () => {
    const { bubble, lineX, container } = mount(mine, { text: "", ytId: "dQw4w9WgXcQ" })
    fireEvent.click(screen.getByText("YouTube"))
    const iframe = container.querySelector("iframe") as HTMLIFrameElement
    expect(iframe).not.toBeNull()
    expectOnOwnSide(mine, bubble, lineX)
    const i = iframe.getBoundingClientRect()
    const b = bubble.getBoundingClientRect()
    expect(i.width).toBeCloseTo(320, 0) // колонка достаточно широка: ролик показан целиком
    expect(i.left).toBeGreaterThanOrEqual(b.left)
    expect(i.right).toBeLessThanOrEqual(b.right)
  })

  it("длинный текст: упирается в половину колонки, но не пересекает линию", () => {
    const { bubble, lineX } = mount(mine, { text: LONG })
    expectOnOwnSide(mine, bubble, lineX)
    expect(bubble.getBoundingClientRect().width).toBeGreaterThan(300) // пузырь реально упёрся в предел
  })
})

describe("узкий экран (телефон)", () => {
  it("линия и точки скрыты, пузырь шире половины, но не шире 82%", async () => {
    await page.viewport(375, 800)
    const { thread, row, bubble } = mount(false, { text: LONG })
    expect(getComputedStyle(thread, "::before").display).toBe("none")
    expect(getComputedStyle(row, "::after").display).toBe("none")
    const r = row.getBoundingClientRect().width
    const w = bubble.getBoundingClientRect().width
    expect(w).toBeGreaterThan(r / 2)
    expect(w).toBeLessThanOrEqual(r * 0.82 + 1)
  })

  it("на десктопе линия и точки на месте (мобильное правило не протекло)", () => {
    const { thread, row } = mount(false)
    expect(getComputedStyle(thread, "::before").display).not.toBe("none")
    expect(getComputedStyle(row, "::after").display).not.toBe("none")
  })
})
