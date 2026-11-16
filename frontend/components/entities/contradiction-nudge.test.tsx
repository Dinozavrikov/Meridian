import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { ContradictionNudge } from "@/components/entities/contradiction-nudge"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))

const api = vi.hoisted(() => ({ check: vi.fn(), setVerdict: vi.fn() }))
vi.mock("@/lib/contradiction-api", () => ({ contradictionApi: api }))

const S = STRINGS as Record<string, string>
const item = (id: number) => ({ feedback_id: id, relation: "противоречит", confidence: 80, existing_quote: `старое ${id}`, new_quote: `новое ${id}` })

const mount = (isOwner = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ContradictionNudge entityType="observation" entityId={1} text="текст" accent="#1ABC9C" isOwner={isOwner} />
    </QueryClientProvider>,
  )

beforeEach(() => { api.check.mockReset(); api.setVerdict.mockReset(); api.setVerdict.mockResolvedValue({}) })
afterEach(cleanup)

describe("ContradictionNudge: полоса состояния", () => {
  it("не владелец, ничего не проверялось — полосы нет вообще", () => {
    expect(mount(false).container.firstChild).toBeNull()
  })

  it("владелец: видно, что проверка не запускалась, и есть кнопка запуска", () => {
    mount()
    expect(screen.getByText(S["contradictionNudge.title"])).toBeTruthy()
    expect(screen.getByText(new RegExp(S["contradictionNudge.notChecked"]))).toBeTruthy()
    expect(screen.getByRole("button", { name: S["contradictionNudge.runShort"] })).toBeTruthy()
  })

  it("ничего не найдено: так и сказано, запустить можно снова", async () => {
    api.check.mockResolvedValue([])
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["contradictionNudge.runShort"] }))
    expect(await screen.findByText(new RegExp(S["contradictionNudge.noneFound"]))).toBeTruthy()
    expect(screen.getByRole("button", { name: S["contradictionNudge.recheck"] })).toBeTruthy()
  })

  it("найдено два: счётчик и обе цитаты; кнопка запуска скрыта, пока не разобраны; после разбора всех — исходное состояние", async () => {
    api.check.mockResolvedValue([item(1), item(2)])
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["contradictionNudge.runShort"] }))
    expect(await screen.findByText(/найдено: 2/)).toBeTruthy()
    expect(screen.getByText(/старое 1/)).toBeTruthy()
    expect(screen.getByText(/новое 2/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: S["contradictionNudge.runShort"] })).toBeNull()

    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(S["contradictionNudge.accept"]) })[0])
    expect(await screen.findByText(/найдено: 1/)).toBeTruthy()
    expect(api.setVerdict).toHaveBeenCalledWith(1, "accepted")

    fireEvent.click(screen.getByRole("button", { name: new RegExp(S["contradictionNudge.reject"]) }))
    expect(await screen.findByText(new RegExp(S["contradictionNudge.notChecked"]))).toBeTruthy()
    expect(api.setVerdict).toHaveBeenLastCalledWith(2, "rejected")
    expect(screen.getByRole("button", { name: S["contradictionNudge.runShort"] })).toBeTruthy()
  })

  it("проверка не удалась: об этом сказано, повторить можно", async () => {
    api.check.mockRejectedValue(new Error("сеть"))
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["contradictionNudge.runShort"] }))
    expect(await screen.findByText(new RegExp(S["contradictionNudge.failed"]))).toBeTruthy()
    expect(screen.getByRole("button", { name: S["contradictionNudge.runShort"] })).toBeTruthy()
  })
})
