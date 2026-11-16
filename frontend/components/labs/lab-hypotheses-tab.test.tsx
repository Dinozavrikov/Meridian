import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, hypApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { LabHypothesesTab } from "@/components/labs/lab-hypotheses-tab"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
// Перевод контента здесь не предмет проверки: берём настоящий useQuery без слоя перевода.
vi.mock("@/lib/i18n/use-translated-query", async () => {
  const { useQuery } = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return { useTranslatedListQuery: (key: unknown[], fn: () => Promise<unknown>) => useQuery({ queryKey: key, queryFn: fn }) }
})
vi.mock("@/components/ui/status-badge", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { StatusBadge: ({ status }: { status: string }) => React.createElement("span", null, status) }
})
vi.mock("@/components/ui/modal", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    Modal: ({ open, children }: { open: boolean; children?: import("react").ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
  }
})
vi.mock("@/components/entities/hypothesis-form", () => ({ HypForm: () => null }))

const S = STRINGS as Record<string, string>
const HYPS = [
  { id: 11, user_id: 2, name: "Предложенная гипотеза", status: "идея", lab_id: 5 },
  { id: 12, user_id: 2, name: "Уже конкурирующая", status: "идея", lab_id: 5 },
]

function Harness({ canManage = true, isMember = true }: { canManage?: boolean; isMember?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <LabHypothesesTab labId={5} labName="Лаб" canManage={canManage} isMember={isMember}
      linkedHypIds={new Set([12])} bare includeOpened={open} onIncludeOpenedChange={setOpen} />
  )
}

describe("«Предложения» гипотез лаборатории: счётчики карточки", () => {
  it.each([
    ["attach", "labTabs.attach"],
    ["reject", "labTabs.reject"],
  ])("«%s» предложения идёт в API и сбрасывает карточку лаборатории (в URL слаг, а не id)", async (action, key) => {
    vi.spyOn(hypApi, "list").mockResolvedValue(HYPS as never)
    const post = vi.spyOn(api, "post").mockResolvedValue({} as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    qc.setQueryData(["lab", "my-slug"], { id: 5, hypotheses_count: 1 })
    render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)

    await screen.findByText("Предложенная гипотеза")
    expect(screen.queryByText("Уже конкурирующая")).toBeNull()       // привязанная к цели — не «предложение»
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)

    fireEvent.click(screen.getByText(S[key] ?? key))
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/labs/5/hypotheses/11/${action}`))
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })
})

describe("Сегмент include_opened", () => {
  it("открытая гипотеза не попадает в «Предложения», а идёт в группу «Открыто владельцами»", async () => {
    const openedHyp = { id: 13, user_id: 2, name: "Открытая чужая гипотеза", status: "идея", lab_id: null }
    const list = vi.spyOn(hypApi, "list").mockResolvedValue([...HYPS, openedHyp] as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
    await screen.findByText("Предложенная гипотеза")
    expect(screen.queryByText("Открытая чужая гипотеза")).toBeNull()
    fireEvent.click(screen.getByText(S["graph.segment.withOpened"]))
    await screen.findByText(S["labTabs.sharedWithLab"])
    expect(screen.getByText("Открытая чужая гипотеза")).toBeTruthy()
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ lab_id: 5, includeOpened: true }))
  })
})
