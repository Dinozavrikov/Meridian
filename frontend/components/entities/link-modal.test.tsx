import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { LinkModal } from "@/components/entities/link-modal"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }))
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ observation: "Наблюдение" }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))

const S = STRINGS as Record<string, string>

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.post.mockResolvedValue({ data: {} })
  h.get.mockImplementation(async (url: string) =>
    url.includes("/graph/search") ? { data: [{ type: "observation", id: 77, title: "Новое наблюдение", is_own: true }] } : { data: [] })
})
afterEach(cleanup)

function open(entityType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><LinkModal entityType={entityType} entityId={1} onlyType="observation" onClose={() => {}} /></QueryClientProvider>)
}
const chip = (key: string) => screen.queryByRole("button", { name: S[key] })

describe("LinkModal", () => {
  it("запись другого типа: все три типа связи", () => {
    open("hypothesis")
    for (const k of ["linkType.confirms", "linkType.refutes", "linkType.related"]) expect(chip(k), k).not.toBeNull()
  })

  it("запись того же типа: «подтверждает/опровергает» не предлагаются, привязка уходит как «связано»", async () => {
    open("observation")
    expect(chip("linkType.confirms")).toBeNull()
    expect(chip("linkType.refutes")).toBeNull()
    fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "н" } })
    fireEvent.click(await screen.findByText("Новое наблюдение"))
    await waitFor(() => expect(h.post).toHaveBeenCalled())
    expect(h.post.mock.calls[0][0]).toContain(`link_type=${encodeURIComponent("связано")}`)
  })
})
