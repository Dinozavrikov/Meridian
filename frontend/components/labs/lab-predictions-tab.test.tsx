import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { predApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { LabPredictionsTab } from "@/components/labs/lab-predictions-tab"
import { toast } from "@/lib/toast"
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))

const { showReflection, uploadImages } = vi.hoisted(() => ({ showReflection: vi.fn(), uploadImages: vi.fn() }))

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
vi.mock("@/components/labs/prediction-preview-modal", () => ({ PredictionPreviewModal: () => null }))
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
vi.mock("@/lib/use-post-create-reflection", () => ({ usePostCreateReflection: () => ({ show: showReflection, modalNode: null }) }))

beforeEach(() => { showReflection.mockClear(); uploadImages.mockReset() })
afterEach(() => vi.restoreAllMocks())

vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [{ id: 5, name: "Лаба", is_public: false }] }) }))

const S = STRINGS as Record<string, string>
const PREDS = [
  { id: 1, user_id: 1, title: "Мой прогноз", text: "", status: "не проверен", visibility: "lab", lab_id: 5 },
  { id: 2, user_id: 2, title: "Чужой прогноз", text: "", status: "не проверен", visibility: "lab", lab_id: 5 },
]

function Harness({ labId = 5, canEdit = true }: { labId?: number; canEdit?: boolean }) {
  const [open, setOpen] = useState(false)
  return <LabPredictionsTab labId={labId} canEdit={canEdit} includeOpened={open} onIncludeOpenedChange={setOpen} />
}

function mount() {
  vi.spyOn(predApi, "list").mockResolvedValue(PREDS as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  qc.setQueryData(["lab", "my-slug"], { id: 5, predictions_count: 2 })
  render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
  return qc
}
async function openForm() {
  await screen.findByText("Мой прогноз")
  fireEvent.click(screen.getByText(S["actions.addPrediction"]))
  await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
}
const typeText = (v: string) => fireEvent.change(screen.getByLabelText("editor"), { target: { value: v } })
const checkInput = () => document.querySelector('input[type="datetime-local"]') as HTMLInputElement
const slider = () => document.querySelector('input[type="range"]') as HTMLInputElement
const CREATED = { id: 3, title: "", text: "текст", status: "не проверен", confidence: 70 }

describe("вкладка «Прогнозы» лаборатории", () => {
  it("корзина есть только у своего прогноза; удаление идёт в API и обновляет список", async () => {
    const qc = mount()
    const remove = vi.spyOn(predApi, "delete").mockResolvedValue({} as never)
    vi.spyOn(window, "confirm").mockReturnValue(true)
    void qc

    await screen.findByText("Мой прогноз")
    expect(screen.getByText("Чужой прогноз")).toBeTruthy()
    const buttons = screen.getAllByRole("button", { name: S["labTabs.deleteAria"] })
    expect(buttons).toHaveLength(1)                                    // только у своего

    fireEvent.click(buttons[0])
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1))
    await waitFor(() => expect((predApi.list as any).mock.calls.length).toBeGreaterThan(1))   // список перечитан после удаления
  })
})

describe("вкладка «Прогнозы»: счётчики карточки лаборатории", () => {
  it("удаление прогноза сбрасывает карточку лаборатории, даже когда в URL слаг, а не id", async () => {
    const qc = mount()
    vi.spyOn(predApi, "delete").mockResolvedValue({} as never)
    vi.spyOn(window, "confirm").mockReturnValue(true)

    await screen.findByText("Мой прогноз")
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)
    fireEvent.click(screen.getAllByRole("button", { name: S["labTabs.deleteAria"] })[0])
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })

  it("создание прогноза сбрасывает карточку лаборатории, даже когда в URL слаг, а не id", async () => {
    const qc = mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    await openForm()
    expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(false)
    typeText("текст")
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(create).toHaveBeenCalled())
    await waitFor(() => expect(qc.getQueryState(["lab", "my-slug"])!.isInvalidated).toBe(true))
  })
})

describe("вкладка «Прогнозы»: форма создания", () => {
  it("форма та же, что на странице прогнозов: редактор, слайдер уверенности; видимость выбрать нельзя; дата проверки не подставлена", async () => {
    mount()
    await openForm()
    expect(screen.getByLabelText("editor")).toBeTruthy()
    expect(slider()).toBeTruthy()
    expect(screen.queryByText(S["visibility.private"])).toBeNull()
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
    expect(screen.getByTestId("lab-locked-note")).toBeTruthy()
    // раньше дата проверки по умолчанию была «сегодня» — прогноз сразу попадал в очередь проверки
    expect(checkInput().value).toBe("")
  })

  it("создание из лаборатории шлёт видимость lab, lab_id лаборатории и выбранную уверенность (а не NULL)", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    await openForm()
    typeText("текст")
    fireEvent.change(slider(), { target: { value: "70" } })
    fireEvent.change(checkInput(), { target: { value: "2027-01-01T10:00" } })
    fireEvent.submit(document.querySelector("form")!)

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({
      visibility: "lab", lab_id: 5, confidence: 70, text: "текст", hypothesis_id: null,
      expected_check_date: expect.any(String),
    }))
  })

  it("после создания показывается рефлексия, как на странице прогнозов", async () => {
    mount()
    vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    await openForm()
    typeText("текст")
    fireEvent.change(checkInput(), { target: { value: "2027-01-01T10:00" } })
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(showReflection).toHaveBeenCalledWith(expect.objectContaining({ id: 3 })))
  })

  it("не создаёт прогноз с пустым текстом", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
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
    fireEvent.click(screen.getByText(S["actions.addPrediction"]))
    await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
    expect((screen.getByLabelText("editor") as HTMLTextAreaElement).value).toBe("")
  })
})

describe("ошибки создания", () => {
  it("запись не создана: форма остаётся открытой с сообщением, повтор не плодит дубль, при закрытии ошибка стирается", async () => {
    mount()
    const create = vi.spyOn(predApi, "create").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(CREATED as never)
    await openForm()
    typeText("текст")
    fireEvent.change(checkInput(), { target: { value: "2027-01-01T10:00" } })
    fireEvent.submit(document.querySelector("form")!)
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(document.querySelector("form")).not.toBeNull()

    fireEvent.click(screen.getByText(S["actions.cancel"]))       // закрыли с ошибкой — при повторном открытии её быть не должно
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    fireEvent.click(screen.getByText(S["actions.addPrediction"]))
    await waitFor(() => expect(document.querySelector("form")).not.toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()

    typeText("текст")
    fireEvent.change(checkInput(), { target: { value: "2027-01-01T10:00" } })
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    expect(create).toHaveBeenCalledTimes(2)                       // первая попытка ничего не создала
  })

  it("запись создана, а загрузка картинки упала: форма закрывается (повторное сохранение не создаст дубль), пользователь предупреждён", async () => {
    mount()
    const toastSpy = vi.mocked(toast)
    toastSpy.mockClear()
    uploadImages.mockRejectedValueOnce(new Error("boom"))
    const create = vi.spyOn(predApi, "create").mockResolvedValue(CREATED as never)
    await openForm()
    typeText("текст")
    fireEvent.click(screen.getByText("add-image"))
    fireEvent.change(checkInput(), { target: { value: "2027-01-01T10:00" } })
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(document.querySelector("form")).toBeNull())
    expect(create).toHaveBeenCalledTimes(1)
    expect(toastSpy).toHaveBeenCalledTimes(1)
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ tone: "warn" })
    expect(toastSpy.mock.calls[0][0].message).toContain(S["errors.partialCreate.images"])
  })
})

describe("вкладка «Прогнозы»: текст про видимость в форме", () => {
  it("закрытая лаборатория — запись видна только участникам, выбора видимости нет", async () => {
    mount()
    await openForm()
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.lab"])
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
  })
})

describe("Сегмент include_opened", () => {
  it("по умолчанию false; тумблер шлёт includeOpened=true и открытое уходит в группу «Открыто владельцами»", async () => {
    const opened = { id: 99, user_id: 2, title: "Открытый прогноз", text: "", status: "не проверен", visibility: "lab", lab_id: null }
    const list = vi.spyOn(predApi, "list").mockResolvedValue([...PREDS, opened] as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
    await screen.findByText("Мой прогноз")
    expect(list).toHaveBeenCalledWith({ lab_id: 5, includeOpened: false })
    expect(screen.queryByText(S["labTabs.sharedWithLab"])).toBeNull()
    fireEvent.click(screen.getByText(S["graph.segment.withOpened"]))
    await screen.findByText(S["labTabs.sharedWithLab"])
    expect(screen.getByText("Открытый прогноз")).toBeTruthy()
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ lab_id: 5, includeOpened: true }))
  })
})
