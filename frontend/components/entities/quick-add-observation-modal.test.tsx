import { STRINGS as _S } from "@/lib/i18n/strings"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { obsApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { OBSERVATION_STATUSES } from "@/lib/observation-constants"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { QuickAddObservationModal } from "@/components/entities/quick-add-observation-modal"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [{ id: 5, name: "Лаба" }] }) }))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [{ value: "связано", label: "Связано", color: "#999999" }],
}))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null, uploadImagesFor: vi.fn() }))
vi.mock("@/components/ui/ruler", () => ({ Ruler: () => null }))

afterEach(() => vi.restoreAllMocks())

const S = STRINGS as Record<string, string>
function mount(labId?: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <QuickAddObservationModal open onClose={vi.fn()} targetType="hypothesis" targetId={42} targetLabel="Гипотеза" labId={labId} />
    </QueryClientProvider>,
  )
}
const submitWithText = () => {
  fireEvent.change(screen.getByPlaceholderText(_S["observations.titlePlaceholder"]), { target: { value: "Название" } })
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: "текст" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("QuickAddObservationModal", () => {
  it("предлагает те же стадии, что и основная форма, и не старые «требует уточнения»/«устарело»", () => {
    mount()
    for (const s of OBSERVATION_STATUSES) expect(screen.getByText(s)).toBeTruthy()
    expect(screen.queryByText("требует уточнения")).toBeNull()
    expect(screen.queryByText("устарело")).toBeNull()
  })

  it("внутри лаборатории: нет выбора видимости, создаётся с visibility=lab и lab_id, и привязывается к родителю", async () => {
    mount(5)
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 9 } as never)
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
    submitWithText()

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "lab", lab_id: 5, text: "текст" }))
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "observation", 9, [expect.objectContaining({ type: "hypothesis", id: 42, link_type: "связано" })],
    ))
  })

  it("вне лаборатории выбор видимости есть и по умолчанию наблюдение личное без lab_id", async () => {
    mount()
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 10 } as never)
    expect(screen.getByText(S["visibility.public"])).toBeTruthy()
    submitWithText()

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ visibility: "private", lab_id: null }))
  })
})
