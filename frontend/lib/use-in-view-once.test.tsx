import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, act, cleanup } from "@testing-library/react"
import { useInViewOnce } from "@/lib/use-in-view-once"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Probe() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>()
  return <div ref={ref} data-testid="probe">{String(seen)}</div>
}

describe("useInViewOnce", () => {
  it("без IntersectionObserver сразу true (граф не должен остаться пустым в старых браузерах)", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    render(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("true")
  })

  it("пока элемент не виден — false; когда стал виден — true и наблюдение прекращается; назад не откатывается", () => {
    const disconnect = vi.fn()
    let callback: ((e: { isIntersecting: boolean }[]) => void) | null = null
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) { callback = cb }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    })
    render(<Probe />)
    expect(screen.getByTestId("probe").textContent).toBe("false")
    act(() => { callback?.([{ isIntersecting: false }]) })
    expect(screen.getByTestId("probe").textContent).toBe("false")
    act(() => { callback?.([{ isIntersecting: true }]) })
    expect(screen.getByTestId("probe").textContent).toBe("true")
    expect(disconnect).toHaveBeenCalled()
    act(() => { callback?.([{ isIntersecting: false }]) })
    expect(screen.getByTestId("probe").textContent).toBe("true")
  })
})
