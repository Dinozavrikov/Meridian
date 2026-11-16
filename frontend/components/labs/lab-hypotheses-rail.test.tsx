import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, hypApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { LabHypothesesRail } from "@/components/labs/lab-hypotheses-rail"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [{ id: 5, name: "Лаб", is_public: false }] }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useListContentTranslation: () => (_h: any, _f: string, fallback: any) => fallback }))
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
vi.mock("@/components/entities/entity-quick-add-menu", () => ({ EntityQuickAddMenu: () => null }))
vi.mock("@/components/ui/ruler", () => ({ Ruler: () => null }))
vi.mock("@/components/ui/status-badge", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { StatusBadge: ({ status }: { status: string }) => React.createElement("span", null, status) }
})
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null, uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/tag-calibration-hint", () => ({ TagCalibrationHint: () => null }))

afterEach(() => vi.restoreAllMocks())

const S = STRINGS as Record<string, string>
const ph = (k: string) => S[k] ?? k
const CREATED = { id: 21, name: "Новая", description: "" }

function mount() {
  vi.spyOn(api, "get").mockResolvedValue({ data: [] } as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <LabHypothesesRail parentType="task" parentId={9} allHyps={[]} focusedId={null} onFocus={vi.fn()} onPreview={vi.fn()}
        canEdit canAddForecast={false} labId={5} labName="Лаб" />
    </QueryClientProvider>,
  )
}
async function openForm() {
  fireEvent.click(await screen.findByText(ph("labHyps.createNew")))
  await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
}
function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText(ph("hypotheses.namePlaceholder")), { target: { value: "Новая" } })
  fireEvent.change(screen.getByPlaceholderText(ph("hypotheses.falsificationPlaceholder")), { target: { value: "если X — неверна" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("боковая колонка гипотез лаборатории: создать и прикрепить", () => {
  it("гипотеза создаётся в этой лаборатории и прикрепляется к цели; форма закрывается", async () => {
    mount()
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} } as never)
    await openForm()
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ name: "Новая", lab_id: 5, visibility: "lab" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/tasks/9/hypotheses/21"))
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
  })

  it("в форме нет выбора видимости: вместо него текст про лабораторию", async () => {
    mount()
    await openForm()
    expect(screen.queryByText(S["field.visibility"])).toBeNull()
    expect(screen.getByTestId("lab-locked-note")).toBeTruthy()
  })

  it("привязка упала после создания: форма закрывается (повторное сохранение не создаст дубль), пользователь предупреждён", async () => {
    mount()
    const toastSpy = vi.mocked(toast)
    toastSpy.mockClear()
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    vi.spyOn(api, "post").mockRejectedValue(new Error("403"))
    await openForm()
    fillAndSubmit()
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    expect(create).toHaveBeenCalledTimes(1)
    expect(toastSpy).toHaveBeenCalledTimes(1)
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ tone: "warn" })
    expect(toastSpy.mock.calls[0][0].message).toContain(S["errors.partialCreate.attach"])
  })

  it("создание отклонено сервером: форма остаётся открытой с сообщением, привязка не пытается создаваться", async () => {
    mount()
    vi.spyOn(hypApi, "create").mockRejectedValue(new Error("boom"))
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} } as never)
    await openForm()
    fillAndSubmit()
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(document.querySelector("form")).not.toBeNull()
    expect(post).not.toHaveBeenCalled()
  })
})
