import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { obsApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { OBSERVATION_STATUSES } from "@/lib/observation-constants"
import { LabObservationsTab } from "@/components/labs/lab-observations-tab"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

const { uploadImages } = vi.hoisted(() => ({ uploadImages: vi.fn() }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
// Перевод контента здесь не предмет проверки: берём настоящий useQuery без слоя перевода.
vi.mock("@/lib/i18n/use-translated-query", async () => {
  const { useQuery } = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return { useTranslatedListQuery: (key: unknown[], fn: () => Promise<unknown>) => useQuery({ queryKey: key, queryFn: fn }) }
})
vi.mock("@/components/labs/observation-preview-modal", () => ({ ObservationPreviewModal: () => null }))
vi.mock("@/components/ui/status-badge", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { StatusBadge: ({ status }: { status: string }) => React.createElement("span", null, status) }
})
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))
vi.mock("@/components/entities/images-tab", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    LocalImagePicker: ({ onChange }: any) => React.createElement("button", { type: "button", onClick: () => onChange([new File(["x"], "a.png")]) }, "add-image"),
    uploadImagesFor: uploadImages,
  }
})
vi.mock("@/components/ui/ruler", () => ({ Ruler: () => null }))

beforeEach(() => uploadImages.mockReset())
afterEach(() => vi.restoreAllMocks())

vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [{ id: 5, name: "Лаба", is_public: false }] }) }))

const S = STRINGS as Record<string, string>
const OBS = [
  { id: 1, user_id: 1, title: "Моё наблюдение", text: "", status: "осмысленное", importance: 0, date: "2024-01-01", visibility: "lab", lab_id: 5 },
  { id: 2, user_id: 2, title: "Чужое наблюдение", text: "", status: "осмысленное", importance: 0, date: "2024-01-01", visibility: "lab", lab_id: 5 },
]

function Harness({ labId = 5, canEdit = true }: { labId?: number; canEdit?: boolean }) {
  const [open, setOpen] = useState(false)
  return <LabObservationsTab labId={labId} canEdit={canEdit} includeOpened={open} onIncludeOpenedChange={setOpen} />
}

function mount() {
  vi.spyOn(obsApi, "list").mockResolvedValue(OBS as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  qc.setQueryData(["lab", "my-slug"], { id: 5, observations_count: 2 })
  render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
  return qc
}
async function openForm() {
  await screen.findByText("Моё наблюдение")
  fireEvent.click(screen.getByText(S["actions.addObservationTrigger"]))
  await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
}
const typeText = (v: string) => {
  fireEvent.change(screen.getByPlaceholderText(S["observations.titlePlaceholder"]), { target: { value: "Название" } })
  fireEvent.change(screen.getByLabelText("editor"), { target: { value: v } })
}

describe("вкладка «Наблюдения» лаборатории: счётчики карточки", () => {
  it("удаление наблюдения сбрасывает карточку лаборатории, даже когда в URL слаг, а не id", async () => {
    const qc = mount()
    const remove = vi.spyOn(obsApi, "delete").mockResolvedValue({} as never)
    vi.spyOn(window, "confirm").mockReturnValue(true)

    await screen.findByText("Моё наблюдение")
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)

    fireEvent.click(screen.getAllByRole("button", { name: S["labTabs.deleteAria"] })[0])
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1))
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })
})

describe("вкладка «Наблюдения»: форма создания", () => {
  it("форма та же, что на странице наблюдений: редактор, теги, все стадии, значимость; видимость выбрать нельзя", async () => {
    mount()
    await openForm()
    expect(screen.getByLabelText("editor")).toBeTruthy()
    expect(screen.getByPlaceholderText(S["observations.tagsPlaceholder"])).toBeTruthy()
    for (const s of OBSERVATION_STATUSES) expect(screen.getAllByText(s).length).toBeGreaterThan(0)
    expect(screen.getByText(S["observations.importanceHeading"])).toBeTruthy()
    expect(screen.queryByText(S["visibility.private"])).toBeNull()
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
  })

  it("создание из лаборатории отправляет видимость lab, lab_id лаборатории, выбранные статус и теги", async () => {
    mount()
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 3 } as never)
    await openForm()
    typeText("текст")
    fireEvent.change(screen.getByPlaceholderText(S["observations.tagsPlaceholder"]), { target: { value: "a, b" } })
    fireEvent.click(screen.getByText("сырое"))
    fireEvent.submit(document.querySelector("form")!)

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({
      visibility: "lab", lab_id: 5, status: "сырое", tags: ["a", "b"], text: "текст",
    }))
  })

  it("не создаёт наблюдение с пустым текстом", async () => {
    mount()
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 3 } as never)
    await openForm()
    fireEvent.submit(document.querySelector("form")!)
    expect(await screen.findByText(S["field.textRequired"])).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it("при повторном открытии форма чистая", async () => {
    mount()
    await openForm()
    typeText("черновик")
    fireEvent.click(screen.getByText(S["actions.cancel"]))
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    fireEvent.click(screen.getByText(S["actions.addObservationTrigger"]))
    await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
    expect((screen.getByLabelText("editor") as HTMLTextAreaElement).value).toBe("")
  })

  it("создание наблюдения сбрасывает карточку лаборатории, даже когда в URL слаг, а не id", async () => {
    const qc = mount()
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 3 } as never)
    await openForm()
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)
    typeText("текст")
    fireEvent.submit(document.querySelector("form")!)

    await waitFor(() => expect(create).toHaveBeenCalled())
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })
})

describe("ошибки создания", () => {
  it("запись не создана: форма остаётся открытой с сообщением, повтор не плодит дубль, при закрытии ошибка стирается", async () => {
    mount()
    const create = vi.spyOn(obsApi, "create").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ id: 3, text: "текст" } as never)
    await openForm()
    typeText("текст")
    fireEvent.submit(document.querySelector("form")!)
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(document.querySelector("form")).not.toBeNull()

    fireEvent.click(screen.getByText(S["actions.cancel"]))       // закрыли с ошибкой — при повторном открытии её быть не должно
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    fireEvent.click(screen.getByText(S["actions.addObservationTrigger"]))
    await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()

    typeText("текст")
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    expect(create).toHaveBeenCalledTimes(2)                       // первая попытка ничего не создала
  })

  it("запись создана, а загрузка картинки упала: форма закрывается (повторное сохранение не создаст дубль), пользователь предупреждён", async () => {
    mount()
    const toastSpy = vi.mocked(toast)
    toastSpy.mockClear()
    uploadImages.mockRejectedValueOnce(new Error("boom"))
    const create = vi.spyOn(obsApi, "create").mockResolvedValue({ id: 3, text: "текст" } as never)
    await openForm()
    typeText("текст")
    fireEvent.click(screen.getByText("add-image"))
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    expect(create).toHaveBeenCalledTimes(1)
    expect(toastSpy).toHaveBeenCalledTimes(1)
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ tone: "warn" })
    expect(toastSpy.mock.calls[0][0].message).toContain(S["errors.partialCreate.images"])
  })
})

describe("вкладка «Наблюдения»: текст про видимость в форме", () => {
  it("закрытая лаборатория — запись видна только участникам, выбора видимости нет", async () => {
    mount()
    await openForm()
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.lab"])
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
  })
})

describe("Сегмент include_opened", () => {
  it("по умолчанию false; тумблер шлёт includeOpened=true и открытое уходит в группу «Открыто владельцами»", async () => {
    const opened = { id: 99, user_id: 2, title: "Открытое наблюдение", text: "", status: "осмысленное", importance: 0, date: "2024-01-02", visibility: "lab", lab_id: null }
    const list = vi.spyOn(obsApi, "list").mockResolvedValue([...OBS, opened] as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
    await screen.findByText("Моё наблюдение")
    expect(list).toHaveBeenCalledWith({ lab_id: 5, includeOpened: false })
    expect(screen.queryByText(S["labTabs.sharedWithLab"])).toBeNull()
    fireEvent.click(screen.getByText(S["graph.segment.withOpened"]))
    await screen.findByText(S["labTabs.sharedWithLab"])
    expect(screen.getByText("Открытое наблюдение")).toBeTruthy()
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ lab_id: 5, includeOpened: true }))
  })
})
