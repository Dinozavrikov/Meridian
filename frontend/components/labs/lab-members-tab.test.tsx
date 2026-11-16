import { describe, it, expect, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { invalidateLabMembership } from "@/lib/lab-queries"
import { LabMembersTab } from "@/components/labs/lab-members-tab"

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
vi.mock("@/components/labs/user-preview-modal", () => ({ UserPreviewModal: () => null }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }))
vi.mock("@/components/ui/select", () => ({ Select: () => null }))

describe("вкладка «Участники» лаборатории", () => {
  it("когда состав изменился (принята заявка, вступление, выход), список участников реально перечитывается", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] } as never)
    // staleTime как в проде (providers.tsx): без сброса свежие данные не перечитываются 30 секунд
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } } })
    qc.setQueryData(["lab", "my-slug"], { id: 5 })   // страница держит карточку под слагом из URL
    render(<QueryClientProvider client={qc}><LabMembersTab labId={5} isOwner /></QueryClientProvider>)

    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/labs/5/members"))
    const before = get.mock.calls.length

    await invalidateLabMembership(qc, 5)
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))
  })
})
