import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { toast, type ToastRequest } from "@/lib/toast"
import { ToastHost } from "@/components/ui/toast-host"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>

beforeEach(() => { vi.useFakeTimers(); render(<ToastHost />) })
afterEach(() => { cleanup(); vi.useRealTimers() })

const show = (r: Partial<ToastRequest> = {}) => act(() => { toast({ message: "m", ...r } as ToastRequest) })

describe("ToastHost: Esc только при фокусе внутри тоста", () => {
  it("Esc на кнопке «Вернуть» закрывает тост: onClose('closed'), откат не выполняется", () => {
    const onClose = vi.fn(); const run = vi.fn()
    show({ undo: { run }, onClose })
    fireEvent.keyDown(screen.getByRole("button", { name: S["toast.undo"] }), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith("closed")
    expect(run).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).toBeNull()
  })
  it("охранный (зелёный и до патча): Esc вне тоста его не закрывает", () => {
    const onClose = vi.fn()
    show({ undo: { run: async () => {} }, onClose })
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toBeTruthy()
  })
  it("охранный (зелёный и до патча): другая клавиша на тосте его не закрывает", () => {
    const onClose = vi.fn()
    show({ undo: { run: async () => {} }, onClose })
    fireEvent.keyDown(screen.getByRole("button", { name: S["toast.undo"] }), { key: "a" })
    expect(onClose).not.toHaveBeenCalled()
  })
  it("Esc на тосте не доходит до обработчиков выше (окно под тостом остаётся)", () => {
    const above = vi.fn()
    document.addEventListener("keydown", above)
    show({ undo: { run: async () => {} } })
    fireEvent.keyDown(screen.getByRole("button", { name: S["toast.undo"] }), { key: "Escape" })
    document.removeEventListener("keydown", above)
    expect(above).not.toHaveBeenCalled()
  })
})
