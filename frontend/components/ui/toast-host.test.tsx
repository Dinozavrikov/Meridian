import { describe, it, expect, vi, afterEach } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { toast, type ToastRequest } from "@/lib/toast"
import { ToastHost } from "@/components/ui/toast-host"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>
const show = (r: ToastRequest) => act(() => { toast(r) })
const undoBtn = () => screen.getByRole("button", { name: S["toast.undo"] })

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe("ToastHost", () => {
  it("обычное уведомление идёт как status, ошибка как alert", () => {
    render(<ToastHost />)
    show({ message: "Готово" })
    expect(screen.getByRole("status").textContent).toContain("Готово")
    show({ message: "Сбой", tone: "error" })
    expect(screen.getByRole("alert").textContent).toContain("Сбой")
  })

  it("«Вернуть» запускает откат один раз и закрывает уведомление", async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    render(<ToastHost />); show({ message: "Связь добавлена", undo: { run } })
    fireEvent.click(undoBtn())
    await waitFor(() => expect(screen.queryByText("Связь добавлена")).toBeNull())
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("пока откат выполняется, кнопка заблокирована и второй клик ничего не запускает", async () => {
    let finish!: () => void
    const run = vi.fn(() => new Promise<void>(res => { finish = res }))
    render(<ToastHost />); show({ message: "Связь добавлена", undo: { run } })
    fireEvent.click(undoBtn())
    await waitFor(() => expect((undoBtn() as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(undoBtn())
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    await waitFor(() => expect(screen.queryByText("Связь добавлена")).toBeNull())
  })

  it("откат не удался: исходное уведомление закрыто, показана ошибка", async () => {
    const run = vi.fn().mockRejectedValue(new Error("409"))
    render(<ToastHost />); show({ message: "Связь добавлена", undo: { run } })
    fireEvent.click(undoBtn())
    expect((await screen.findByRole("alert")).textContent).toContain(S["toast.actionFailed"])
    expect(screen.queryByText("Связь добавлена")).toBeNull()
  })

  it("крестик закрывает уведомление", () => {
    render(<ToastHost />); show({ message: "Готово" })
    fireEvent.click(screen.getByRole("button", { name: S["toast.dismiss"] }))
    expect(screen.queryByText("Готово")).toBeNull()
  })

  it("одновременно не больше трёх, старые вытесняются", () => {
    render(<ToastHost />)
    for (const m of ["n1", "n2", "n3", "n4"]) show({ message: m })
    expect(screen.queryByText("n1")).toBeNull()
    for (const m of ["n2", "n3", "n4"]) expect(screen.getByText(m)).toBeTruthy()
  })

  it("после размонтирования хоста вызов toast не падает", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { unmount } = render(<ToastHost />); unmount()
    expect(() => toast({ message: "поздно" })).not.toThrow()
  })
})

describe("ToastHost: автозакрытие", () => {
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

  it("обычное закрывается само через 4,5 с", () => {
    vi.useFakeTimers(); render(<ToastHost />); show({ message: "Готово" })
    tick(4400); expect(screen.queryByText("Готово")).not.toBeNull()
    tick(200); expect(screen.queryByText("Готово")).toBeNull()
  })

  it("с «Вернуть» живёт 8 с", () => {
    vi.useFakeTimers(); render(<ToastHost />); show({ message: "Связь добавлена", undo: { run: () => {} } })
    tick(7900); expect(screen.queryByText("Связь добавлена")).not.toBeNull()
    tick(200); expect(screen.queryByText("Связь добавлена")).toBeNull()
  })

  it("пока мышь на карточке, не закрывается; после ухода отсчёт идёт заново", () => {
    vi.useFakeTimers(); render(<ToastHost />); show({ message: "Готово" })
    fireEvent.mouseEnter(screen.getByRole("status"))
    tick(60000); expect(screen.queryByText("Готово")).not.toBeNull()
    fireEvent.mouseLeave(screen.getByRole("status"))
    tick(4400); expect(screen.queryByText("Готово")).not.toBeNull()
    tick(200); expect(screen.queryByText("Готово")).toBeNull()
  })
})
