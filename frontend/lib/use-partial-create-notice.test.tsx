import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
afterEach(() => vi.restoreAllMocks())
const S = STRINGS as Record<string, string>

describe("usePartialCreateNotice", () => {
  it.each([[undefined], [null], [{}], [{ _failedSteps: [] }]])("ничего не показывает, если всё удалось (%j)", (created) => {
    const spy = vi.mocked(toast).mockClear()
    const { result } = renderHook(() => usePartialCreateNotice())
    result.current(created as any)
    expect(spy).not.toHaveBeenCalled()
  })
  it("называет все провалившиеся шаги одним сообщением", () => {
    const spy = vi.mocked(toast).mockClear()
    const { result } = renderHook(() => usePartialCreateNotice())
    result.current({ _failedSteps: ["links", "images"] })
    expect(spy).toHaveBeenCalledTimes(1)
    const text = (spy.mock.calls[0][0] as { message: string }).message
    expect(text).toContain(S["errors.partialCreate.links"])
    expect(text).toContain(S["errors.partialCreate.images"])
  })
})

describe("usePartialCreateNotice: привязка к цели лаборатории", () => {
  it("называет шаг привязки к цели", () => {
    const spy = vi.mocked(toast).mockClear()
    const { result } = renderHook(() => usePartialCreateNotice())
    result.current({ _failedSteps: ["attach"] })
    expect(spy.mock.calls[0][0].message).toContain(S["errors.partialCreate.attach"])
  })
})
