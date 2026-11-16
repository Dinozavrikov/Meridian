import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { api } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { useQuickCreateAndLink } from "@/lib/use-quick-create-and-link"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ createLinksFor: vi.fn() }))

const S = STRINGS as Record<string, string>

function setup(created: any) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, "invalidateQueries")
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
  const hook = renderHook(() => useQuickCreateAndLink({
    entityType: "observation", create: vi.fn().mockResolvedValue(created), target: { type: "hypothesis", id: 5 },
    invalidateKeys: [["observations"]],
  }), { wrapper })
  return { ...hook, invalidate }
}

describe("useQuickCreateAndLink: «Вернуть» после создания", () => {
  beforeEach(() => { vi.mocked(toast).mockClear(); vi.mocked(createLinksFor).mockReset() })
  afterEach(() => vi.restoreAllMocks())

  it("личная запись: тост с «Вернуть»; нажатие удаляет запись (в корзину) и обновляет данные", async () => {
    const del = vi.spyOn(api, "delete").mockResolvedValue({} as never)
    const { result, invalidate } = setup({ id: 7, visibility: "private" })
    await act(async () => { await result.current.mutateAsync({}) })
    expect(toast).toHaveBeenCalledTimes(1)
    const req = vi.mocked(toast).mock.calls[0][0]
    expect(req.message).toBe(S["quickCreate.created"])
    expect(req.undo).toBeTruthy()
    expect(del).not.toHaveBeenCalled()
    invalidate.mockClear()
    await act(async () => { await req.undo!.run() })
    expect(del).toHaveBeenCalledWith("/api/v1/observations/7")
    const keys = invalidate.mock.calls.map(c => JSON.stringify((c[0] as any).queryKey))
    expect(keys).toContain(JSON.stringify(["related", "observation", 7]))
    expect(keys).toContain(JSON.stringify(["related", "hypothesis", 5]))
    expect(keys).toContain(JSON.stringify(["feed"]))
    expect(keys).toContain(JSON.stringify(["observations"]))
  })

  it("откат не удался: ошибка уходит хосту (он покажет её), данные не обновляются как будто всё вернулось", async () => {
    vi.spyOn(api, "delete").mockRejectedValue(new Error("boom"))
    const { result, invalidate } = setup({ id: 7, visibility: "private" })
    await act(async () => { await result.current.mutateAsync({}) })
    const req = vi.mocked(toast).mock.calls[0][0]
    invalidate.mockClear()
    await act(async () => { await expect(req.undo!.run()).rejects.toThrow("boom") })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("ОХРАННЫЙ (зелёный и до патча): запись лаборатории или публичная: тоста нет, затронуть других «Вернуть» не может", async () => {
    for (const visibility of ["lab", "public"]) {
      const { result } = setup({ id: 7, visibility })
      await act(async () => { await result.current.mutateAsync({}) })
    }
    expect(toast).not.toHaveBeenCalled()
  })

  it("ОХРАННЫЙ (зелёный и до патча): нет поля visibility в ответе: тоста нет (ошибка в безопасную сторону)", async () => {
    const { result } = setup({ id: 7 })
    await act(async () => { await result.current.mutateAsync({}) })
    expect(toast).not.toHaveBeenCalled()
  })

  it("ОХРАННЫЙ (зелёный и до патча): личная запись, но привязка упала: одно предупреждение без «Вернуть»", async () => {
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    const { result } = setup({ id: 7, visibility: "private" })
    await act(async () => { await result.current.mutateAsync({}) })
    expect(toast).toHaveBeenCalledTimes(1)
    const req = vi.mocked(toast).mock.calls[0][0]
    expect(req.tone).toBe("warn")
    expect(req.undo).toBeUndefined()
  })
})
