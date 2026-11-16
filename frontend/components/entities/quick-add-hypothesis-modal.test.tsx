import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { QuickAddHypothesisModal } from "@/components/entities/quick-add-hypothesis-modal"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

const { labsState } = vi.hoisted(() => ({ labsState: { data: [{ id: 5, name: "Лаба", is_public: false }] as any[] } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: labsState.data }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null, uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/tag-calibration-hint", () => ({ TagCalibrationHint: () => null }))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [{ value: "связано", label: "Связано", color: "#999999" }],
}))

beforeEach(() => vi.mocked(createLinksFor).mockReset())
afterEach(() => vi.restoreAllMocks())

const S = STRINGS as Record<string, string>
const ph = (k: string) => S[k] ?? k
const CREATED = { id: 9, name: "Гипотеза", description: "" }

function mount(labId?: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <QuickAddHypothesisModal open onClose={vi.fn()} targetType="observation" targetId={42} targetLabel="Наблюдение" labId={labId} />
    </QueryClientProvider>,
  )
}
const fill = (criteria = true) => {
  fireEvent.change(screen.getByPlaceholderText(ph("hypotheses.namePlaceholder")), { target: { value: "Гипотеза" } })
  if (criteria) fireEvent.change(screen.getByPlaceholderText(ph("hypotheses.falsificationPlaceholder")), { target: { value: "если X — неверна" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("QuickAddHypothesisModal", () => {
  it("форма та же, что на странице: критерий опровержения, теги, статус; без критерия — предупреждение, а не молчаливое сохранение", async () => {
    mount()
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.getByPlaceholderText(ph("hypotheses.tagsPlaceholder"))).toBeTruthy()
    expect(screen.getByText(S["field.status"])).toBeTruthy()

    fill(false)
    expect(screen.getByText(S["hypotheses.falsificationWarning"])).toBeTruthy()
    expect(create).not.toHaveBeenCalled()

    fireEvent.submit(document.querySelector("form")!)      // повторное сохранение осознанно без критерия
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  })

  it("гипотеза создаётся и привязывается к родителю с id новой записи", async () => {
    mount()
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    fill()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ name: "Гипотеза", visibility: "private", lab_id: null }))
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "hypothesis", 9, [expect.objectContaining({ type: "observation", id: 42, link_type: "связано" })],
    ))
  })

  it("внутри лаборатории: выбора видимости нет, уходят visibility=lab и lab_id", async () => {
    mount(5)
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.queryByText(S["field.visibility"])).toBeNull()
    expect(screen.getByTestId("lab-locked-note")).toBeTruthy()
    fill()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "lab", lab_id: 5 }))
  })

  it("сервер отклонил запись: форма остаётся открытой с сообщением, привязка не создаётся", async () => {
    mount()
    vi.spyOn(hypApi, "create").mockRejectedValue(new Error("boom"))
    fill()
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(document.querySelector("form")).not.toBeNull()
    expect(createLinksFor).not.toHaveBeenCalled()
  })

  it("привязка к родителю упала после создания: форма закрывается (повторное сохранение не создаст дубль), пользователь предупреждён", async () => {
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <QuickAddHypothesisModal open onClose={onClose} targetType="observation" targetId={42} targetLabel="Наблюдение" />
      </QueryClientProvider>,
    )
    const toastSpy = vi.mocked(toast)
    toastSpy.mockClear()
    const create = vi.spyOn(hypApi, "create").mockResolvedValue(CREATED as never)
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    fill()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
    expect(toastSpy).toHaveBeenCalledTimes(1)
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ tone: "warn" })
    expect(toastSpy.mock.calls[0][0].message).toContain(S["errors.partialCreate.links"])
  })
})
