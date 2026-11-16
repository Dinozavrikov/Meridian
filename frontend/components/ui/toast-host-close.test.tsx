import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { toast, toastDurationMs, type ToastRequest } from "@/lib/toast"
import { ToastHost } from "@/components/ui/toast-host"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>
const MS = toastDurationMs({ message: "m", undo: { run: () => {} } })

beforeEach(() => { vi.useFakeTimers(); render(<ToastHost />) })
afterEach(() => { cleanup(); vi.useRealTimers() })

const show = (r: Partial<ToastRequest> = {}) => act(() => { toast({ message: "m", ...r } as ToastRequest) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe("ToastHost: onClose сообщает, почему тост убран", () => {
  it("таймер: onClose('closed') один раз", async () => {
    const onClose = vi.fn()
    show({ undo: { run: async () => {} }, onClose })
    await advance(MS - 1)
    expect(onClose).not.toHaveBeenCalled()
    await advance(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("closed")
  })

  it("крестик: onClose('closed')", async () => {
    const onClose = vi.fn()
    show({ onClose })
    expect(S["toast.dismiss"]).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["toast.dismiss"] }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("closed")
  })

  it("«Вернуть» удалась: onClose('undone'), 'closed' не приходит", async () => {
    const onClose = vi.fn(); const run = vi.fn(async () => {})
    show({ undo: { run }, onClose })
    expect(S["toast.undo"]).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: S["toast.undo"] })) })
    expect(run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("undone")
  })

  it("«Вернуть» не удалась: onClose('closed')", async () => {
    const onClose = vi.fn()
    show({ undo: { run: async () => { throw new Error("x") } }, onClose })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: S["toast.undo"] })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("closed")
  })

  it("мышь на карточке: тост стоит и onClose не приходит; ушла: закрывается", async () => {
    const onClose = vi.fn()
    show({ undo: { run: async () => {} }, onClose })
    const card = screen.getByRole("status")
    fireEvent.mouseEnter(card)
    await advance(MS * 3)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseLeave(card)
    await advance(MS)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("тост вытеснен новыми (в стопке 3): его onClose('closed') приходит сразу, у остальных нет", async () => {
    const fns = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    fns.forEach((onClose, i) => show({ message: `m${i}`, onClose }))
    expect(fns[0]).toHaveBeenCalledTimes(1)
    expect(fns[0]).toHaveBeenCalledWith("closed")
    for (const f of fns.slice(1)) expect(f).not.toHaveBeenCalled()
  })
})
