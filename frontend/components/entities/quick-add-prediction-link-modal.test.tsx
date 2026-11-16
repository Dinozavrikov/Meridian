import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { predApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { QuickAddPredictionLinkModal } from "@/components/entities/quick-add-prediction-link-modal"

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

beforeEach(() => { showReflection.mockClear(); vi.mocked(createLinksFor).mockClear() })
afterEach(() => vi.restoreAllMocks())

const S = STRINGS as Record<string, string>
const CREATED = { id: 9, title: "", text: "текст" }
function mount(labId?: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <QuickAddPredictionLinkModal open onClose={vi.fn()} targetType="observation" targetId={42} targetLabel="Наблюдение" labId={labId} />
    </QueryClientProvider>,
  )
}
const slider = () => document.querySelector('input[type="range"]') as HTMLInputElement
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: "текст" } })
  fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: "2027-01-01T10:00" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("QuickAddPredictionLinkModal", () => {
  it("уверенность видна и выбирается: шлётся выбранное значение, а не скрытые 50", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    expect(slider()).toBeTruthy()
    expect(slider().value).toBe("50")
    fireEvent.change(slider(), { target: { value: "85" } })
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ confidence: 85, hypothesis_id: null }))
  })

  it("прогноз привязывается к родителю и показывается рефлексия", async () => {
    mount()
    vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    fillAndSubmit()
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "prediction", 9, [expect.objectContaining({ type: "observation", id: 42, link_type: "связано" })],
    ))
    await waitFor(() => expect(showReflection).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })))
  })

  it("внутри лаборатории: нет выбора видимости, уходят visibility=lab и lab_id", async () => {
    mount(5)
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "lab", lab_id: 5 }))
  })

  it("вне лаборатории выбор видимости есть, по умолчанию прогноз личный без lab_id", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    expect(screen.getByText(S["visibility.public"])).toBeTruthy()
    fillAndSubmit()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "private", lab_id: null }))
  })
})
