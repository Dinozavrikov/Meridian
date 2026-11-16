import { describe, it, expect, vi, afterEach } from "vitest"
import { nextOptimisticId } from "./optimistic-id"

afterEach(() => { vi.useRealTimers() })

describe("nextOptimisticId", () => {
  it("id уникальны, даже когда время не меняется (несколько сообщений в одну миллисекунду)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"))
    const ids = Array.from({ length: 1000 }, () => nextOptimisticId())
    expect(new Set(ids).size).toBe(1000)
  })
  it("id всегда отрицательные: не пересекаются с серверными", () => {
    expect(Array.from({ length: 50 }, () => nextOptimisticId()).every(id => id < 0)).toBe(true)
  })
})
