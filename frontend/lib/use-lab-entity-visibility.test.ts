import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

const { state } = vi.hoisted(() => ({ state: { data: [] as any[], enabled: undefined as boolean | undefined } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: (enabled?: boolean) => { state.enabled = enabled; return { data: state.data } } }))

import { useLabEntityVisibility } from "@/lib/use-lab-entity-visibility"

describe("useLabEntityVisibility", () => {
  beforeEach(() => { state.data = []; state.enabled = undefined })

  it("публичная лаборатория -> public", () => {
    state.data = [{ id: 5, is_public: true }]
    expect(renderHook(() => useLabEntityVisibility(5)).result.current).toBe("public")
  })
  it("закрытая лаборатория -> lab", () => {
    state.data = [{ id: 5, is_public: false }]
    expect(renderHook(() => useLabEntityVisibility(5)).result.current).toBe("lab")
  })
  it("без лаборатории -> null, и список лабораторий не запрашивается", () => {
    state.data = [{ id: 5, is_public: true }]
    expect(renderHook(() => useLabEntityVisibility(null)).result.current).toBeNull()
    expect(state.enabled).toBe(false)
  })
  it("лаборатории нет в списке «моих» или в ней нет is_public -> null (форма покажет нейтральный текст, а не угадает)", () => {
    state.data = [{ id: 6, is_public: true }]
    expect(renderHook(() => useLabEntityVisibility(5)).result.current).toBeNull()
    state.data = [{ id: 5, name: "Без is_public" }]
    expect(renderHook(() => useLabEntityVisibility(5)).result.current).toBeNull()
  })
})
