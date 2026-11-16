import { describe, it, expect, vi, afterEach } from "vitest"
import { toast, toastDurationMs, setToastHandler } from "@/lib/toast"

afterEach(() => { setToastHandler(null); vi.restoreAllMocks() })

describe("toastDurationMs", () => {
  it("по умолчанию: обычное 4,5 с, с «Вернуть» 8 с, предупреждения и ошибки 10 с", () => {
    expect(toastDurationMs({ message: "a" })).toBe(4500)
    expect(toastDurationMs({ message: "a", undo: { run: () => {} } })).toBe(8000)
    expect(toastDurationMs({ message: "a", tone: "warn" })).toBe(10000)
    expect(toastDurationMs({ message: "a", tone: "error" })).toBe(10000)
  })
  it("явное значение главнее, в том числе 0 (не закрывать само)", () => {
    expect(toastDurationMs({ message: "a", tone: "error", durationMs: 0 })).toBe(0)
    expect(toastDurationMs({ message: "a", undo: { run: () => {} }, durationMs: 1234 })).toBe(1234)
  })
})

describe("toast", () => {
  it("передаёт запрос хосту", () => {
    const h = vi.fn(); setToastHandler(h)
    toast({ message: "m", tone: "info" })
    expect(h).toHaveBeenCalledWith({ message: "m", tone: "info" })
  })
  it("без хоста не падает и оставляет след в консоли", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() => toast({ message: "потерянное" })).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})
