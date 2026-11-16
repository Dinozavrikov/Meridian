import { describe, expect, it } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { askConfirm } from "@/lib/confirm"
import { ConfirmHost } from "@/components/ui/confirm-host"

const S = STRINGS as Record<string, string>
const REQ = { title: "Удалить заметку?", description: "Копия останется в снимках", confirmLabel: "Удалить" }
function ask(r: Parameters<typeof askConfirm>[0] = REQ) { let p!: Promise<boolean>; act(() => { p = askConfirm(r) }); return p }
const cancelBtn = () => screen.getByText(S["actions.cancel"]).closest("button") as HTMLElement
const okBtn = () => screen.getByText("Удалить").closest("button") as HTMLElement

describe("ConfirmHost", () => {
  it("показывает заголовок и описание", async () => {
    render(<ConfirmHost />); ask()
    const d = await screen.findByRole("dialog")
    expect(d.textContent).toContain(REQ.title); expect(d.textContent).toContain(REQ.description)
  })
  it("кнопка подтверждения даёт true", async () => {
    render(<ConfirmHost />); const p = ask()
    await screen.findByRole("dialog"); fireEvent.click(okBtn()); expect(await p).toBe(true)
  })
  it("«Отмена» даёт false", async () => {
    render(<ConfirmHost />); const p = ask()
    await screen.findByRole("dialog"); fireEvent.click(cancelBtn()); expect(await p).toBe(false)
  })
  it("Esc даёт false", async () => {
    render(<ConfirmHost />); const p = ask(); await screen.findByRole("dialog")
    let done = false; p.then(() => { done = true })
    await waitFor(() => { fireEvent.keyDown(document, { key: "Escape" }); expect(done).toBe(true) })
    expect(await p).toBe(false)
  })
  it("клик по фону даёт false", async () => {
    render(<ConfirmHost />); const p = ask()
    fireEvent.mouseDown(await screen.findByTestId("confirm-overlay")); expect(await p).toBe(false)
  })
  it("клик внутри окна не закрывает его", async () => {
    render(<ConfirmHost />); ask()
    fireEvent.mouseDown(await screen.findByRole("dialog"))
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })
  it("опасное действие: фокус на «Отмене»; обычное: на подтверждении", async () => {
    const { unmount } = render(<ConfirmHost />); ask()
    await screen.findByRole("dialog"); await waitFor(() => expect(document.activeElement).toBe(cancelBtn()))
    act(() => { fireEvent.click(cancelBtn()) }); unmount()
    render(<ConfirmHost />); ask({ ...REQ, tone: "default" })
    await screen.findByRole("dialog"); await waitFor(() => expect(document.activeElement).toBe(okBtn()))
  })
})
