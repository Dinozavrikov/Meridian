import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

const h = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { post: h.post } }))
vi.mock("@/lib/store", () => {
  const state = { locale: "en", translationScope: "ui_and_content", contentTranslations: {}, mergeContentTranslations: () => {}, resetContentTranslations: () => {} }
  return { useStore: (sel: (s: unknown) => unknown) => sel(state) }
})
import { useContentT } from "@/lib/i18n/useContentT"

beforeEach(() => { vi.useFakeTimers(); h.post.mockReset(); h.post.mockResolvedValue({ data: { translations: {} } }) })
afterEach(() => { vi.useRealTimers() })

describe("ensure-content: пачки", () => {
  it("450 пунктов уходят тремя запросами по ≤200, ничего не теряется и не дублируется", () => {
    const { result } = renderHook(() => useContentT())
    const items = Array.from({ length: 450 }, (_, i) => ({ entityType: "observation", entityId: i + 1, field: "text", text: `т${i}` }))
    act(() => result.current.ensure(items))
    act(() => { vi.advanceTimersByTime(300) })
    const sizes = h.post.mock.calls.map(c => c[1].items.length)
    expect(sizes).toEqual([200, 200, 50])
    const ids = h.post.mock.calls.flatMap(c => c[1].items.map((x: { entity_id: number }) => x.entity_id))
    expect(new Set(ids).size).toBe(450)
  })
})

describe("ensure-content: огромные тексты", () => {
  it("пункт длиннее 50 000 не отправляется (остаётся оригинал), остальные уходят", () => {
    const { result } = renderHook(() => useContentT())
    act(() => result.current.ensure([
      { entityType: "observation", entityId: 1, field: "text", text: "а".repeat(50_001) },
      { entityType: "observation", entityId: 2, field: "text", text: "а".repeat(50_000) },
    ]))
    act(() => { vi.advanceTimersByTime(300) })
    const ids = h.post.mock.calls.flatMap(c => c[1].items.map((x: { entity_id: number }) => x.entity_id))
    expect(ids).toEqual([2])
  })
})
