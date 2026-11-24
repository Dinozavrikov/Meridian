import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("next/script", () => ({ default: () => null }))
vi.mock("@/lib/api", () => ({ authApi: { register: vi.fn() } }))
// Перевод — не предмет теста: без подмены загрузчик переводов лезет в api, которого в моке нет, и пишет предупреждение.
vi.mock("@/lib/i18n/useDynamicT", async () => ({
  ...(await vi.importActual<typeof import("@/lib/i18n/useDynamicT")>("@/lib/i18n/useDynamicT")),
  useDynamicTranslate: () => (text: string) => text,
}))

import { authApi } from "@/lib/api"
import RegisterPage from "./page"
import { RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"

beforeEach(() => {
  vi.stubGlobal("turnstile", {
    render: (_el: any, opts: any) => { opts.callback("tok"); return "wid" },
    remove: () => {},
  })
  vi.mocked(authApi.register).mockReset()
})

afterEach(cleanup)

function fill() {
  fireEvent.change(screen.getByPlaceholderText("3–32 символа, буквы, цифры, _ и -, без пробелов"), { target: { value: "Тестовый юзер" } })
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "t@example.com" } })
  fireEvent.change(screen.getByPlaceholderText("Минимум 8 символов"), { target: { value: "newpass123" } })
}

describe("RegisterPage — привязка 422 к полям", () => {
  it("ошибка username из 422 стоит под полем username, а не в общей плашке", async () => {
    vi.mocked(authApi.register).mockRejectedValueOnce({
      response: { status: 422, data: { detail: [
        { type: "value_error", loc: ["body", "username"], msg: "Value error, Имя пользователя не может содержать пробелы — используйте _ или -" },
      ] } },
    })
    render(<RegisterPage />)
    fill()
    const btn = await screen.findByRole("button", { name: /Создать аккаунт/ })
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(btn)
    await waitFor(() => {
      const el = screen.getByText("Имя пользователя не может содержать пробелы — используйте _ или -")
      // На старом коде ошибка шла в общую <p>-плашку; на новом — в <span> под полем.
      // Проверяем ТЕГ, а не текст: иначе тест зелёный на обоих (apiErrorMessage снимает префикс так же).
      expect(el.tagName).toBe("SPAN")
      expect(screen.queryByText("Имя пользователя не может содержать пробелы — используйте _ или -", { selector: "p" })).toBeNull()
    })
  })
})

async function submitRejected(err: unknown) {
  vi.mocked(authApi.register).mockRejectedValueOnce(err)
  render(<RegisterPage />)
  fill()
  const btn = await screen.findByRole("button", { name: /Создать аккаунт/ })
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(btn)
}

describe("RegisterPage — ограничение частоты", () => {
  it("429 показывает сообщение о лимите, а не общую ошибку регистрации", async () => {
    // data: {} без detail: на общей ветке (apiErrorMessage) получилась бы "Ошибка регистрации".
    await submitRejected({ response: { status: 429, data: {} } })
    await waitFor(() => expect(screen.getByText(RATE_LIMITED_MESSAGE)).toBeTruthy())
    expect(screen.queryByText("Ошибка регистрации")).toBeNull()
  })

  it("другая ошибка без detail остается общей, а не сообщением о лимите", async () => {
    await submitRejected({ response: { status: 500, data: {} } })
    await waitFor(() => expect(screen.getByText("Ошибка регистрации")).toBeTruthy())
    expect(screen.queryByText(RATE_LIMITED_MESSAGE)).toBeNull()
  })
})
