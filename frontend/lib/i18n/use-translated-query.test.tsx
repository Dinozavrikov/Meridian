import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const h = vi.hoisted(() => ({ get: vi.fn(), ensure: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_t: string, _i: number, _f: string, text: string) => `T(${text})`, ensure: h.ensure }),
  useListContentTranslation: () => (_item: unknown, _f: string, v: unknown) => v,
}))
import { useTranslatedRelated } from "./use-translated-query"

const M = (type: string, id: number, title: string, is_own: boolean) => ({ type, id, title, is_own, fields: ["text"] })

function run(payload: unknown) {
  h.get.mockResolvedValue({ data: payload })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(() => useTranslatedRelated("hypothesis", 1), { wrapper })
}
const ensured = () => h.ensure.mock.calls.flatMap(c => c[0] as { entityType: string; entityId: number; field: string }[])

describe("useTranslatedRelated: упоминания", () => {
  beforeEach(() => { h.get.mockReset(); h.ensure.mockReset() })

  it("заголовки чужих записей в «Упоминает» и «Упомянуто в» переводятся", async () => {
    const { result } = run({ related: {}, mentions: { mentions: [M("observation", 7, "Чужое", false)], mentioned_in: [M("question", 9, "Чужой вопрос", false)] } })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data.mentions.mentions[0].title).toBe("T(Чужое)")
    expect(result.current.data.mentions.mentioned_in[0].title).toBe("T(Чужой вопрос)")
  })

  it("свои записи не переводятся и перевод для них не запрашивается (охранный: зелёный и до правки)", async () => {
    const { result } = run({ related: {}, mentions: { mentions: [M("task", 8, "Своё", true)], mentioned_in: [] } })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data.mentions.mentions[0].title).toBe("Своё")
    expect(ensured().some(i => i.entityId === 8)).toBe(false)
  })

  it("перевод запрашивается для чужих упоминаний, поле title", async () => {
    run({ related: {}, mentions: { mentions: [M("observation", 7, "Чужое", false)], mentioned_in: [M("question", 9, "Чужой вопрос", false)] } })
    await waitFor(() => expect(ensured().length).toBeGreaterThan(0))
    expect(ensured()).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "observation", entityId: 7, field: "title" }),
      expect.objectContaining({ entityType: "question", entityId: 9, field: "title" }),
    ]))
  })

  it("охранный (зелёный и до правки): ответ без mentions не получает ключа mentions", async () => {
    const { result } = run({ related: { hypothesis: [{ id: 1, type: "hypothesis", title: "H", is_own: false }] } })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect("mentions" in result.current.data).toBe(false)
  })

  it("охранный (зелёный и до правки): заголовки связей по-прежнему переводятся", async () => {
    const { result } = run({ related: { hypothesis: [{ id: 1, type: "hypothesis", title: "H", is_own: false }] } })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data.related.hypothesis[0].title).toBe("T(H)")
  })
})
