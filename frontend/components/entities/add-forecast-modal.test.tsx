import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { predApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { AddForecastModal } from "@/components/entities/add-forecast-modal"

const { showReflection } = vi.hoisted(() => ({ showReflection: vi.fn() }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [{ id: 5, name: "Лаба" }] }) }))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null, uploadImagesFor: vi.fn() }))
vi.mock("@/lib/use-post-create-reflection", () => ({ usePostCreateReflection: () => ({ show: showReflection, modalNode: null }) }))

beforeEach(() => showReflection.mockClear())
afterEach(() => vi.restoreAllMocks())

const S = STRINGS as Record<string, string>
const CREATED = { id: 11, title: "", text: "текст" }
function mount(labId?: number, onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AddForecastModal open onClose={vi.fn()} hypothesisId={9} hypothesisName="Моя гипотеза" labId={labId} onCreated={onCreated} />
    </QueryClientProvider>,
  )
  return onCreated
}
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: "текст" } })
  fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: "2027-01-01T10:00" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("AddForecastModal", () => {
  it("гипотеза закреплена: чип с названием, выбора нет, hypothesis_id уходит из пропа, слайдер есть", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.getByText("Моя гипотеза")).toBeTruthy()
    expect(document.querySelector("select")).toBeNull()
    expect(document.querySelector('input[type="range"]')).toBeTruthy()
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ hypothesis_id: 9, confirms_hypothesis_if_true: true }))
  })

  it("стресс-тест: выбранное направление «опровергает» уходит как confirms_hypothesis_if_true=false", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    fireEvent.click(screen.getByText(S["predictions.directionRefutes"]))
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ hypothesis_id: 9, confirms_hypothesis_if_true: false }))
  })

  it("внутри лаборатории: нет выбора видимости, уходят visibility=lab и lab_id", async () => {
    mount(5)
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "lab", lab_id: 5 }))
  })

  it("после создания зовётся onCreated и показывается рефлексия", async () => {
    const onCreated = mount()
    vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    fillAndSubmit()
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 11 })))
    expect(showReflection).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }))
  })
})
