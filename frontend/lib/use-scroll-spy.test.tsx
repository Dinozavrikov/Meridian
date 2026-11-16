import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useScrollSpy } from "@/lib/use-scroll-spy"

let cb: IntersectionObserverCallback
class FakeIO {
  constructor(c: IntersectionObserverCallback) { cb = c }
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); takeRecords = () => []
}
const IDS = ["a", "b", "c"] as const
const entry = (id: string, isIntersecting: boolean) =>
  ({ target: document.getElementById(id)!, isIntersecting }) as unknown as IntersectionObserverEntry

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIO)
  document.body.innerHTML = '<div id="a"></div><div id="b"></div><div id="c"></div>'
})
afterEach(() => vi.unstubAllGlobals())

describe("useScrollSpy", () => {
  it("начинает с первого раздела и следует за пересечением", () => {
    const { result } = renderHook(() => useScrollSpy(IDS))
    expect(result.current).toBe("a")
    act(() => cb([entry("b", true)], {} as IntersectionObserver))
    expect(result.current).toBe("b")
  })
  it("из нескольких видимых берет первый по порядку страницы, а когда он уходит, следующий", () => {
    const { result } = renderHook(() => useScrollSpy(IDS))
    act(() => cb([entry("c", true), entry("b", true)], {} as IntersectionObserver))
    expect(result.current).toBe("b")
    act(() => cb([entry("b", false)], {} as IntersectionObserver))
    expect(result.current).toBe("c")
  })
  it("если ничего не видно, остается прежний", () => {
    const { result } = renderHook(() => useScrollSpy(IDS))
    act(() => cb([entry("b", true)], {} as IntersectionObserver))
    act(() => cb([entry("b", false)], {} as IntersectionObserver))
    expect(result.current).toBe("b")
  })
  it("без IntersectionObserver ничего не ломается", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    const { result } = renderHook(() => useScrollSpy(IDS))
    expect(result.current).toBe("a")
  })
})
