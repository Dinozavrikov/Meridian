import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act, cleanup } from "@testing-library/react"
import { useElementSize } from "@/lib/use-element-size"

let notify: (() => void) | null = null
let w = 500
let h = 300

beforeEach(() => {
  w = 500; h = 300; notify = null
  vi.stubGlobal("ResizeObserver", class {
    constructor(cb: () => void) { notify = cb }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => w)
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(() => h)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function Probe() {
  const [ref, size] = useElementSize<HTMLDivElement>()
  return <div ref={ref} data-testid="probe">{size.width}x{size.height}</div>
}

describe("useElementSize", () => {
  it("читает размер сразу после монтирования", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("500x300")
  })

  it("обновляется, когда элемент меняет размер (например, тянут разделитель)", () => {
    render(<Probe />)
    w = 820; h = 640
    act(() => { notify?.() })
    expect(screen.getByTestId("probe").textContent).toBe("820x640")
  })
})
