import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, taskApi, questionApi, hypApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import LabPage from "@/app/(app)/labs/[id]/page"

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
// Перевод — не предмет теста, но реальный useQuery нужен.
vi.mock("@/lib/i18n/use-translated-query", async () => {
  const { useQuery } = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return {
    useTranslatedEntityQuery: (key: unknown[], fn: () => Promise<unknown>, _t: string, _f: unknown, opts?: any) =>
      useQuery({ queryKey: key, queryFn: fn, ...(opts ?? {}) }),
    useTranslatedListQuery: (key: unknown[], fn: () => Promise<unknown>, _t: string, _f: unknown, opts?: any) =>
      useQuery({ queryKey: key, queryFn: fn, ...(opts ?? {}) }),
  }
})
vi.mock("@/lib/lab-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lab-queries")>("@/lib/lab-queries")
  return { ...actual, invalidateLabMembership: vi.fn() }
})
// Заглушки дочерних табов: их поведение покрыто своими тестами.
vi.mock("@/components/labs/lab-observations-tab", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { LabObservationsTab: ({ includeOpened, onIncludeOpenedChange }: any) =>
    React.createElement("button", { "data-testid": "obs-toggle", onClick: () => onIncludeOpenedChange(!includeOpened) }, `obs:${includeOpened}`) }
})
vi.mock("@/components/labs/lab-predictions-tab", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { LabPredictionsTab: ({ includeOpened, onIncludeOpenedChange }: any) =>
    React.createElement("button", { "data-testid": "pred-toggle", onClick: () => onIncludeOpenedChange(!includeOpened) }, `pred:${includeOpened}`) }
})
vi.mock("@/components/labs/lab-hypotheses-tab", () => ({ LabHypothesesTab: () => null }))
vi.mock("@/components/labs/lab-hypotheses-rail", () => ({ LabHypothesesRail: () => null }))
vi.mock("@/components/labs/hypothesis-preview-modal", () => ({ HypothesisPreviewModal: () => null }))
vi.mock("@/components/hypotheses/sources-tab", () => ({ SourcesTab: () => null }))
vi.mock("@/components/labs/lab-results-tab", () => ({ LabResultsTab: () => null }))
vi.mock("@/components/labs/lab-compare-tab", () => ({ LabCompareTab: () => null }))
vi.mock("@/components/labs/lab-members-tab", () => ({ LabMembersTab: () => null }))
vi.mock("@/components/labs/lab-graph-tab", () => ({ LabGraphTab: () => null }))
vi.mock("@/components/labs/lab-signal-tab", () => ({ LabSignalTab: () => null }))
vi.mock("@/components/labs/lab-feed-tab", () => ({ LabFeedTab: () => null }))
vi.mock("@/components/labs/lab-checkpoints-tab", () => ({ LabCheckpointsTab: () => null }))
vi.mock("@/components/labs/lab-files-tab", () => ({ LabFilesTab: () => null }))
vi.mock("@/components/layout/header", () => ({ Header: () => null }))
vi.mock("@/components/layout/page-shell", () => ({
  PageShell: ({ children }: any) => children,
  PageContent: ({ children }: any) => children,
}))

const S = STRINGS as Record<string, string>

const LAB = {
  id: 5, owner_id: 1, name: "Лаба", slug: "laba", description: "",
  is_public: false, open_join: false, goal_type: "task", goal_id: 1,
  member_count: 1, observations_count: 3, observations_opened_count: 2,
  hypotheses_count: 0, predictions_count: 4, predictions_opened_count: 5,
  results_count: 0, role: "owner",
}

function mount() {
  vi.spyOn(api, "get").mockImplementation((url: string) => {
    if (url === "/api/v1/labs/5") return Promise.resolve({ data: LAB } as never)
    if (url.includes("/hypotheses")) return Promise.resolve({ data: [] } as never)
    if (url.includes("/requests")) return Promise.resolve({ data: [] } as never)
    return Promise.resolve({ data: null } as never)
  })
  vi.spyOn(taskApi, "get").mockResolvedValue({ id: 1, name: "Цель", description: "" } as never)
  vi.spyOn(questionApi, "get").mockResolvedValue({ id: 1, title: "", text: "" } as never)
  vi.spyOn(hypApi, "list").mockResolvedValue([] as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><LabPage /></QueryClientProvider>)
  return qc
}

function findTab(label: string): HTMLElement {
  const tab = screen.getAllByRole("button").find(b => (b.textContent ?? "").startsWith(label))
  if (!tab) throw new Error(`tab not found: ${label}`)
  return tab
}
function tabBadgeText(label: string): string {
  const btn = findTab(label)
  return (btn.textContent ?? "").slice(label.length).trim()
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe("Лаба: бейдж «N + M» в шапке таба — только при includeOpened=true", () => {
  it("по умолчанию extra не показывается (только строгое N)", async () => {
    mount()
    await waitFor(() => expect(findTab(S["nav.data.observations"])).toBeTruthy())
    expect(tabBadgeText(S["nav.data.observations"])).toBe("3")
    expect(tabBadgeText(S["nav.data.predictions"])).toBe("4")
  })

  it("включение в «Наблюдениях» добавляет «+ 2» в оба бейджа (одно состояние на всю лабу)", async () => {
    mount()
    const obsBtn = await waitFor(() => findTab(S["nav.data.observations"]))
    fireEvent.click(obsBtn)
    const obsToggle = await screen.findByTestId("obs-toggle")
    fireEvent.click(obsToggle)
    await waitFor(() => expect(tabBadgeText(S["nav.data.observations"])).toBe("3 + 2"))
    expect(tabBadgeText(S["nav.data.predictions"])).toBe("4 + 5")
  })

  it("выключение возвращает строгие N в обоих бейджах", async () => {
    mount()
    const obsBtn = await waitFor(() => findTab(S["nav.data.observations"]))
    fireEvent.click(obsBtn)
    const obsToggle = await screen.findByTestId("obs-toggle")
    fireEvent.click(obsToggle)
    await waitFor(() => expect(tabBadgeText(S["nav.data.observations"])).toBe("3 + 2"))
    fireEvent.click(obsToggle)
    await waitFor(() => expect(tabBadgeText(S["nav.data.observations"])).toBe("3"))
    expect(tabBadgeText(S["nav.data.predictions"])).toBe("4")
  })
})
