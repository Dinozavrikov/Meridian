import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { scheduleDelete, cancelDelete, flushDeletes, commitDelete, DELETE_DELAY_MS } from "@/lib/deferred-delete"

const mk = () => ({ run: vi.fn(async () => {}), leave: vi.fn(), onSettled: vi.fn() })
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { flushDeletes(); vi.useRealTimers() })

describe("отложенное удаление", () => {
  it("run вызывается один раз по истечении окна, не раньше; onSettled(true)", async () => {
    const o = mk()
    expect(scheduleDelete("a", o)).toBe(true)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS - 1)
    expect(o.run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(o.run).toHaveBeenCalledTimes(1)
    expect(o.onSettled).toHaveBeenCalledWith(true)
  })
  it("отмена до окна: true, run не вызывается никогда", async () => {
    const o = mk()
    scheduleDelete("a", o)
    expect(cancelDelete("a")).toBe(true)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
    expect(o.run).not.toHaveBeenCalled()
  })
  it("отмена после того, как удаление ушло: false", async () => {
    const o = mk()
    scheduleDelete("a", o)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS)
    expect(o.run).toHaveBeenCalledTimes(1)
    expect(cancelDelete("a")).toBe(false)
  })
  it("повторная постановка того же ключа игнорируется", async () => {
    const o1 = mk(), o2 = mk()
    expect(scheduleDelete("a", o1)).toBe(true)
    expect(scheduleDelete("a", o2)).toBe(false)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS)
    expect(o1.run).toHaveBeenCalledTimes(1)
    expect(o2.run).not.toHaveBeenCalled()
  })
  it("run упал: onSettled(false)", async () => {
    const o = { ...mk(), run: vi.fn(async () => { throw new Error("x") }) }
    scheduleDelete("a", o)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS)
    expect(o.onSettled).toHaveBeenCalledWith(false)
  })
  it("pagehide: уходит leave, run не вызывается и таймер снят", async () => {
    const o = mk()
    scheduleDelete("a", o)
    window.dispatchEvent(new Event("pagehide"))
    expect(o.leave).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
    expect(o.run).not.toHaveBeenCalled()
  })
  it("flushDeletes без leave выполняет run сразу и один раз", async () => {
    const o = { run: vi.fn(async () => {}), onSettled: vi.fn() }
    scheduleDelete("a", o)
    flushDeletes()
    await vi.advanceTimersByTimeAsync(0)
    expect(o.run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
    expect(o.run).toHaveBeenCalledTimes(1)
  })
})

describe("commitDelete: выполнить ожидающее удаление сейчас", () => {
  it("run вызывается сразу и один раз, таймер снят, отмена уже невозможна", async () => {
    const o = mk()
    scheduleDelete("a", o)
    expect(commitDelete("a")).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(o.run).toHaveBeenCalledTimes(1)
    expect(o.onSettled).toHaveBeenCalledWith(true)
    expect(cancelDelete("a")).toBe(false)
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
    expect(o.run).toHaveBeenCalledTimes(1)
  })
  it("нечего выполнять (не ставилось или отменено): false", () => {
    expect(commitDelete("нет")).toBe(false)
    const o = mk(); scheduleDelete("a", o); cancelDelete("a")
    expect(commitDelete("a")).toBe(false)
  })
})
