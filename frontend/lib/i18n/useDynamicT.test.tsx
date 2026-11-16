import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act, waitFor } from "@testing-library/react"
import { useStore } from "@/lib/store"
import { api } from "@/lib/api"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"

vi.mock("@/lib/api", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, api: { post: vi.fn() } }
})

type Body = { strings: Record<string, string> }
const post = api.post as unknown as ReturnType<typeof vi.fn>
const translated = (body: Body) => ({
  data: { translations: Object.fromEntries(Object.keys(body.strings).map(k => [k, `EN ${k}`])), missing: [] as string[] },
})

function Probe({ strings }: { strings: string[] }) {
  const dt = useDynamicTranslate(strings)
  return <div data-testid="out">{strings.map(s => dt(s)).join(" | ")}</div>
}

function setLocale(locale: string) {
  act(() => { useStore.setState({ locale }) })
}

beforeEach(() => {
  localStorage.clear()
  post.mockReset()
  post.mockImplementation(async (_url: string, body: Body) => translated(body))
  vi.spyOn(console, "warn").mockImplementation(() => {})
  setLocale("ru")
  act(() => { useStore.setState({ dynamicTranslations: {} }) })
})

describe("useDynamicTranslate", () => {
  it("re-translates when the language changes after mount (regression)", async () => {
    render(<Probe strings={["Привет мир"]} />)
    expect(post).not.toHaveBeenCalled()
    setLocale("en")
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("EN Привет мир"))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe("/api/v1/i18n/ensure/en")
  })

  it("переводит при монтировании, если язык уже en", async () => {
    setLocale("en")
    render(<Probe strings={["Второй текст"]} />)
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("EN Второй текст"))
  })

  it("не принимает и не кэширует ответ, равный оригиналу", async () => {
    post.mockImplementation(async (_url: string, body: Body) => ({ data: { translations: { ...body.strings }, missing: [] } }))
    setLocale("en")
    render(<Probe strings={["Эхо-текст"]} />)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    expect(screen.getByTestId("out").textContent).toBe("Эхо-текст")
    expect(localStorage.getItem("dyn-i18n-cache:v2:en")).toBeNull()
  })

  it("длинный список уходит последовательными пачками по 10", async () => {
    const strings = Array.from({ length: 25 }, (_, i) => `Длинный список ${i}`)
    setLocale("en")
    render(<Probe strings={strings} />)
    await waitFor(() => expect(screen.getByTestId("out").textContent).toContain("EN Длинный список 24"))
    expect(post.mock.calls.map(c => Object.keys((c[1] as Body).strings).length)).toEqual([10, 10, 5])
  })

  it("повторяет строки, которые сервер вернул в missing", async () => {
    post.mockImplementationOnce(async () => ({ data: { translations: {}, missing: ["Повторный текст"] } }))
    setLocale("en")
    render(<Probe strings={["Повторный текст"]} />)
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("EN Повторный текст"), { timeout: 6000 })
    expect(post).toHaveBeenCalledTimes(2)
  }, 10000)
})
