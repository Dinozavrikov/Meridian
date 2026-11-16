import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"

const m = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: m.get, delete: vi.fn(), post: vi.fn(), put: vi.fn() } }))
import { VisibilityControl } from "@/components/entities/passport-shares"

const row = (id: number, lab: string) => ({ id, lab_id: id, lab_name: lab, via_type: "observation", via_id: 2, via_title: "R" })
function mount(isOwner = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><VisibilityControl visibility="private" entityType="observation" entityId={9} isOwner={isOwner} onOpen={() => {}} /></QueryClientProvider>)
}
beforeEach(() => m.get.mockReset())

describe("VisibilityControl", () => {
  it("с доступом рядом с пилюлей виден сегмент «Открыто: Лаба» без кликов", async () => {
    m.get.mockResolvedValue({ data: [row(1, "Лаба")] })
    mount()
    expect(await screen.findByText("Открыто: Лаба")).toBeTruthy()
    expect(m.get).toHaveBeenCalledWith("/api/v1/observation/9/shares")
  })
  it("несколько лабораторий: счётчик", async () => {
    m.get.mockResolvedValue({ data: [row(1, "А"), row(2, "Б")] })
    mount()
    expect(await screen.findByText(STRINGS["shares.chipMany"].replace("{n}", "2"))).toBeTruthy()
  })
  it("нет доступов: сегмента нет", async () => {
    m.get.mockResolvedValue({ data: [] })
    mount()
    await vi.waitFor(() => expect(m.get).toHaveBeenCalled())
    expect(screen.queryByText(/Открыто:/)).toBeNull()
  })
  it("не владелец: запроса нет", () => {
    mount(false)
    expect(m.get).not.toHaveBeenCalled()
  })
})
