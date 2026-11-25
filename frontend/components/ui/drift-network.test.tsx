import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { DriftNetwork } from "@/components/ui/drift-network"

// Сеть проверяется на подмененных requestAnimationFrame, matchMedia и холсте:
// кадры гоняются вручную, время задается явно.
const W = 800
const H = 600
// Math.random подменен на 0.75: все узлы стартуют в одной точке и летят в одну сторону
const START_X = 0.75 * W
const FRAME_60 = 1000 / 60
const FRAME_144 = 1000 / 144

type FrameCb = (t: number) => void

function setup(reduce: boolean) {
  vi.spyOn(Math, "random").mockReturnValue(0.75)
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(W)
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(H)
  const ctx = {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(),
    strokeStyle: "", fillStyle: "", lineWidth: 0,
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  )

  const pending = new Map<number, FrameCb>()
  let nextId = 1
  const raf = vi.fn((cb: FrameCb) => { const id = nextId++; pending.set(id, cb); return id })
  const caf = vi.fn((id: number) => { pending.delete(id) })
  vi.stubGlobal("requestAnimationFrame", raf)
  vi.stubGlobal("cancelAnimationFrame", caf)

  const listeners = new Set<() => void>()
  const mq = {
    matches: reduce,
    addEventListener: vi.fn((_type: string, cb: () => void) => { listeners.add(cb) }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => { listeners.delete(cb) }),
  }
  const matchMedia = vi.fn<(q: string) => typeof mq>(() => mq)
  vi.stubGlobal("matchMedia", matchMedia)

  return {
    ctx, raf, pending, listeners, matchMedia,
    setReduce(v: boolean) { mq.matches = v; for (const cb of [...listeners]) cb() },
  }
}
type Rig = ReturnType<typeof setup>

function frameAt(s: Rig, t: number) {
  const cbs = [...s.pending.values()]
  s.pending.clear()
  for (const cb of cbs) cb(t)
}
function runFor(s: Rig, stepMs: number, seconds: number) {
  const n = Math.round((seconds * 1000) / stepMs)
  for (let i = 0; i <= n; i++) frameAt(s, 1000 + i * stepMs)
}
function lastDotX(s: Rig) {
  const calls = s.ctx.arc.mock.calls
  return calls[calls.length - 1][0] as number
}
function teardown() {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
}
afterEach(teardown)

describe("DriftNetwork", () => {
  it("без ограничений движения сеть движется", () => {
    const s = setup(false)
    render(<DriftNetwork />)
    expect(s.pending.size).toBe(1)
    runFor(s, FRAME_60, 5)
    expect(s.pending.size).toBe(1)
    expect(lastDotX(s) - START_X).toBeGreaterThan(5)
  })

  it("при уменьшении движения рисуется один статичный кадр и анимации нет", () => {
    const s = setup(true)
    render(<DriftNetwork />)
    expect(s.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
    expect(s.raf).not.toHaveBeenCalled()
    expect(s.pending.size).toBe(0)
    expect(s.ctx.arc).toHaveBeenCalled()
  })

  it("смена настройки на открытой странице включает и выключает движение", () => {
    const s = setup(false)
    render(<DriftNetwork />)
    expect(s.pending.size).toBe(1)
    s.setReduce(true)
    expect(s.pending.size).toBe(0)
    s.setReduce(false)
    expect(s.pending.size).toBe(1)
  })

  it("скорость не зависит от частоты кадров экрана", () => {
    const a = setup(false)
    render(<DriftNetwork />)
    runFor(a, FRAME_60, 5)
    const slow = lastDotX(a) - START_X
    teardown()
    const b = setup(false)
    render(<DriftNetwork />)
    runFor(b, FRAME_144, 5)
    const fast = lastDotX(b) - START_X
    expect(slow).toBeGreaterThan(5)
    expect(fast).toBeGreaterThan(5)
    expect(Math.abs(fast - slow)).toBeLessThan(0.5)
  })

  it("после паузы кадр не делает скачок", () => {
    const s = setup(false)
    render(<DriftNetwork />)
    frameAt(s, 1000)
    const before = lastDotX(s)
    frameAt(s, 11000)
    const jump = lastDotX(s) - before
    expect(jump).toBeGreaterThan(0)
    expect(jump).toBeLessThan(0.5)
  })

  it("при размонтировании кадры и слушатели снимаются", () => {
    const s = setup(false)
    const { unmount } = render(<DriftNetwork />)
    expect(s.pending.size).toBe(1)
    expect(s.listeners.size).toBe(1)
    unmount()
    expect(s.pending.size).toBe(0)
    expect(s.listeners.size).toBe(0)
  })
})

type IoCb = (entries: { isIntersecting: boolean }[]) => void

function stubObserver() {
  const made: { cb: IoCb; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  class FakeObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(cb: IoCb) { made.push({ cb, observe: this.observe, disconnect: this.disconnect }) }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  return { made, fire: (isIntersecting: boolean) => made[0].cb([{ isIntersecting }]) }
}

describe("DriftNetwork за пределами экрана", () => {
  it("пока сеть не видна, кадры не запрашиваются, при возвращении она снова движется", () => {
    const s = setup(false)
    const o = stubObserver()
    render(<DriftNetwork />)
    expect(o.made).toHaveLength(1)
    expect(o.made[0].observe).toHaveBeenCalledTimes(1)
    expect(s.pending.size).toBe(1)
    o.fire(false)
    expect(s.pending.size).toBe(0)
    o.fire(true)
    expect(s.pending.size).toBe(1)
    runFor(s, FRAME_60, 2)
    expect(lastDotX(s) - START_X).toBeGreaterThan(1)
  })

  it("при размонтировании наблюдатель отключается", () => {
    setup(false)
    const o = stubObserver()
    const { unmount } = render(<DriftNetwork />)
    expect(o.made[0].disconnect).not.toHaveBeenCalled()
    unmount()
    expect(o.made[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it("за экраном и обратно при уменьшении движения анимация не включается", () => {
    const s = setup(true)
    const o = stubObserver()
    render(<DriftNetwork />)
    o.fire(false)
    o.fire(true)
    expect(s.raf).not.toHaveBeenCalled()
    expect(s.pending.size).toBe(0)
  })
})
