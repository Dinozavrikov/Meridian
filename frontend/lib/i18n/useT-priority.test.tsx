// Загрузчик переводов в сборе: строки, которые экран уже запросил, переводятся в первой пачке, пачки ограничены по объему.
import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }))
import { api } from "@/lib/api"
import { useStore } from "@/lib/store"
import { STRINGS } from "@/lib/i18n/strings"
import { CHUNK_MAX_CHARS, useT, useTranslationsLoader } from "@/lib/i18n/useT"

describe("загрузчик переводов", () => {
  it("первая пачка содержит запрошенный экраном ключ из хвоста словаря, пачки не длиннее предела", async () => {
    const post = vi.mocked(api.post)
    post.mockImplementation((async (_u: string, body: { strings: Record<string, string> }) => ({
      data: { translations: Object.fromEntries(Object.entries(body.strings).map(([k, v]) => [k, `EN ${v}`])) },
    })) as never)
    useStore.setState({ locale: "en" } as never)
    const tail = Object.keys(STRINGS).filter(k => k.startsWith("termsPage.")).pop()!
    const { result } = renderHook(() => useT())
    result.current(tail)
    renderHook(() => useTranslationsLoader())
    await waitFor(() => expect(post.mock.calls.length).toBeGreaterThan(3))
    const chunks = post.mock.calls.map(c => (c[1] as { strings: Record<string, string> }).strings)
    expect(Object.keys(chunks[0])).toContain(tail)
    for (const c of chunks) {
      const keys = Object.keys(c)
      expect(keys.length === 1 || keys.reduce((n, k) => n + c[k].length, 0) <= CHUNK_MAX_CHARS).toBe(true)
    }
  })
})
