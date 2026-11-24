import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, authApi: { ...actual.authApi, googleAvailable: vi.fn(), login: vi.fn() } }
})
// Перевод не предмет теста: без подмены загрузчик переводов лезет в api.
vi.mock("@/lib/i18n/useDynamicT", async () => ({
  ...(await vi.importActual<typeof import("@/lib/i18n/useDynamicT")>("@/lib/i18n/useDynamicT")),
  useDynamicTranslate: () => (text: string) => text,
}))

import { authApi } from "@/lib/api"
import LoginPage from "./page"
import { GOOGLE_ERROR_MESSAGES, GOOGLE_ERROR_FALLBACK } from "@/lib/auth-messages"

const open = (qs: string) => window.history.replaceState(null, "", "/login" + qs)

beforeEach(() => {
  vi.mocked(authApi.googleAvailable).mockReset()
  vi.mocked(authApi.googleAvailable).mockResolvedValue({ available: true } as any)
})
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/") })

describe("LoginPage: ошибки входа через Google", () => {
  it.each(Object.entries(GOOGLE_ERROR_MESSAGES))("код %s показывает свое сообщение и убирает параметр из адреса", async (code, message) => {
    open(`?google_error=${code}`)
    render(<LoginPage />)
    expect(await screen.findByText(message)).toBeTruthy()
    expect(window.location.search).toBe("")
  })

  it("неизвестный код показывает общее сообщение", async () => {
    open("?google_error=something_new")
    render(<LoginPage />)
    expect(await screen.findByText(GOOGLE_ERROR_FALLBACK)).toBeTruthy()
  })

  it("имя из прототипа в коде не ломает страницу и дает общее сообщение", async () => {
    open("?google_error=constructor")
    render(<LoginPage />)
    expect(await screen.findByText(GOOGLE_ERROR_FALLBACK)).toBeTruthy()
  })

  it("остальные параметры адреса остаются на месте", async () => {
    open("?google_error=denied&next=%2Ffeed")
    render(<LoginPage />)
    await screen.findByText(GOOGLE_ERROR_MESSAGES.denied)
    expect(window.location.search).toBe("?next=%2Ffeed")
  })

  it("без параметра сообщения об ошибке нет", async () => {
    open("")
    render(<LoginPage />)
    await waitFor(() => expect(authApi.googleAvailable).toHaveBeenCalled())
    for (const text of [...Object.values(GOOGLE_ERROR_MESSAGES), GOOGLE_ERROR_FALLBACK]) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })
})
