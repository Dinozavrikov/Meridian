import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { PassportVisibility } from "@/components/entities/passport-visibility"

const h = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { put: h.put } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [] }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>

beforeEach(() => { h.put.mockReset(); h.put.mockResolvedValue({ data: {} }) })
afterEach(cleanup)

const mount = (isOwner: boolean) => render(
  <QueryClientProvider client={new QueryClient()}>
    <PassportVisibility entityType="observation" entityId={5} visibility="private" labId={null} isOwner={isOwner} accent="#1ABC9C" />
  </QueryClientProvider>,
)

describe("PassportVisibility", () => {
  it("не автор видит бейдж без кнопки", () => {
    mount(false)
    expect(screen.getByText(S["visibility.private"])).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("автор выбирает «Публичное», сохраняет — уходит запрос на нужный адрес", async () => {
    mount(true)
    fireEvent.click(screen.getByRole("button", { name: S["visibility.private"] }))
    fireEvent.click(screen.getByRole("button", { name: S["visibility.public"] }))
    fireEvent.click(screen.getByRole("button", { name: S["actions.save"] }))
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/api/v1/observation/5/visibility", { visibility: "public", lab_id: null }))
  })

  it("«Лаборатория» без выбранной лаборатории сохранить нельзя", () => {
    mount(true)
    fireEvent.click(screen.getByRole("button", { name: S["visibility.private"] }))
    fireEvent.click(screen.getByRole("button", { name: S["visibility.lab"] }))
    expect(screen.getByRole("button", { name: S["actions.save"] }).hasAttribute("disabled")).toBe(true)
    expect(h.put).not.toHaveBeenCalled()
  })
})

describe("PassportVisibility: нет лабораторий", () => {
  it("при выборе «Лаборатория» без лабораторий — пояснение со ссылкой на создание, сохранить нельзя", () => {
    mount(true)
    fireEvent.click(screen.getByRole("button", { name: S["visibility.private"] }))
    fireEvent.click(screen.getByRole("button", { name: S["visibility.lab"] }))
    expect(screen.getByRole("note").textContent).toContain(S["passportVisibility.noLabs"])
    expect(screen.getByRole("link", { name: new RegExp(S["passportVisibility.createLab"]) }).getAttribute("href")).toBe("/labs")
    expect(screen.getByRole("button", { name: S["actions.save"] }).hasAttribute("disabled")).toBe(true)
  })
})
