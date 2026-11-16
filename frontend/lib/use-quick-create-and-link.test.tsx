import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
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
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children)

function setup(create: (b: any) => Promise<any>) {
  const onSuccess = vi.fn()
  const hook = renderHook(() => useQuickCreateAndLink({
    entityType: "observation", create, target: { type: "hypothesis", id: 5 }, linkType: "подтверждает", onSuccess,
  }), { wrapper })
  return { ...hook, onSuccess }
}

describe("useQuickCreateAndLink", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { vi.mocked(createLinksFor).mockReset(); alertSpy = vi.mocked(toast).mockClear() })
  afterEach(() => vi.restoreAllMocks())

  it("успех: запись привязывается к родителю с выбранным типом связи, предупреждений нет", async () => {
    const create = vi.fn().mockResolvedValue({ id: 7 })
    const { result, onSuccess } = setup(create)
    await act(async () => { await result.current.mutateAsync({}) })
    expect(createLinksFor).toHaveBeenCalledWith("observation", 7, [expect.objectContaining({ type: "hypothesis", id: 5, link_type: "подтверждает" })])
    expect(onSuccess).toHaveBeenCalledWith({ id: 7 })
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it("привязка упала: мутация НЕ проваливается (иначе повторное сохранение создаст дубль), запись создана один раз, пользователь предупреждён", async () => {
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    const create = vi.fn().mockResolvedValue({ id: 7 })
    const { result, onSuccess } = setup(create)
    await act(async () => { await result.current.mutateAsync({}) })
    expect(result.current.isError).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 7, _failedSteps: ["links"] }))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy.mock.calls[0][0].message).toContain(S["errors.partialCreate.links"])
  })

  it("провалы шагов самой процедуры создания сохраняются и дополняются провалом привязки; предупреждение одно", async () => {
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    const create = vi.fn().mockResolvedValue({ id: 7, _failedSteps: ["images"] })
    const { result } = setup(create)
    await act(async () => { await result.current.mutateAsync({}) })
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const text = (alertSpy.mock.calls[0][0] as { message: string }).message
    expect(text).toContain(S["errors.partialCreate.images"])
    expect(text).toContain(S["errors.partialCreate.links"])
  })

  it("провал самого создания: мутация падает, привязка не пытается создаваться, предупреждений нет", async () => {
    const create = vi.fn().mockRejectedValue(new Error("boom"))
    const { result, onSuccess } = setup(create)
    await act(async () => { await expect(result.current.mutateAsync({})).rejects.toThrow("boom") })
    expect(createLinksFor).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
