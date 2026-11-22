import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/api", () => ({ authApi: { forgotPassword: vi.fn() } }))
// Перевод не предмет теста: без подмены загрузчик переводов лезет в api, которого в моке нет.
vi.mock("@/lib/i18n/useDynamicT", async () => ({
  ...(await vi.importActual<typeof import("@/lib/i18n/useDynamicT")>("@/lib/i18n/useDynamicT")),
  useDynamicTranslate: () => (text: string) => text,
}))

import { authApi } from "@/lib/api"
import { RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"
import ForgotPasswordPage from "./page"

const SENT = /письмо со ссылкой для сброса пароля/

async function submit() {
  render(<ForgotPasswordPage />)
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "a@example.com" } })
  fireEvent.click(screen.getByRole("button", { name: /Отправить ссылку/ }))
}

beforeEach(() => vi.mocked(authApi.forgotPassword).mockReset())

describe("ForgotPasswordPage", () => {
  it("лимит попыток (429): показано сообщение о лимите, а не уверение, что письмо отправлено", async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce({ response: { status: 429, data: { detail: RATE_LIMITED_MESSAGE } } })
    await submit()
    expect((await screen.findByRole("alert")).textContent).toBe(RATE_LIMITED_MESSAGE)
    expect(screen.queryByText(SENT)).toBeNull()
  })

  it("успех: прежний осторожный текст", async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce({ ok: true })
    await submit()
    expect(await screen.findByText(SENT)).toBeTruthy()
  })

  it("любой другой сбой: тот же осторожный текст, различия между 'нет аккаунта' и 'сервер недоступен' нет", async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce({ response: { status: 500 } })
    await submit()
    expect(await screen.findByText(SENT)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
