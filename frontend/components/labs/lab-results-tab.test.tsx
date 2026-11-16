import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { resultApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { LabResultsTab } from "@/components/labs/lab-results-tab"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
// Перевод контента здесь не предмет проверки: берём настоящий useQuery без слоя перевода.
vi.mock("@/lib/i18n/use-translated-query", async () => {
  const { useQuery } = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return { useTranslatedListQuery: (key: unknown[], fn: () => Promise<unknown>) => useQuery({ queryKey: key, queryFn: fn }) }
})
vi.mock("@/components/ui/modal", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    Modal: ({ open, children }: { open: boolean; children?: import("react").ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
  }
})
vi.mock("@/components/labs/result-detail-modal", () => ({ ResultDetailModal: () => null }))
// Форма результата — отдельная тема; здесь важно только, что её onSave доходит до API и onSuccess.
vi.mock("@/components/entities/result-form", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    ResultForm: ({ onSave }: { onSave: (b: unknown, f: Map<string, File>, s: Set<number>) => Promise<unknown> }) =>
      React.createElement("button", {
        onClick: () => { void onSave({ title: "Итог", body: "", visibility: "lab" }, new Map(), new Set()) },
      }, "stub-save"),
  }
})

const S = STRINGS as Record<string, string>

describe("вкладка «Результаты» лаборатории", () => {
  it("создание результата сбрасывает карточку лаборатории (в URL слаг), иначе бейдж «Результаты N» отстаёт", async () => {
    vi.spyOn(resultApi, "list").mockResolvedValue([] as never)
    const create = vi.spyOn(resultApi, "create").mockResolvedValue(
      { id: 99, title: "Итог", body: "", visibility: "lab" } as never,
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    qc.setQueryData(["lab", "my-slug"], { id: 5, results_count: 0 })
    render(
      <QueryClientProvider client={qc}>
        <LabResultsTab labId={5} canManage isMember labIsPublic={false} bare />
      </QueryClientProvider>,
    )

    await screen.findByText(S["labTabs.resultsEmpty"])
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)   // до создания карточка свежая

    fireEvent.click(screen.getByText(S["results.create"] ?? "results.create"))
    fireEvent.click(await screen.findByText("stub-save"))

    await waitFor(() => expect(create).toHaveBeenCalled())
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })
})
