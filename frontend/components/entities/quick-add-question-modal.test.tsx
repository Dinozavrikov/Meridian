import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { questionApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { QuickAddQuestionModal } from "@/components/entities/quick-add-question-modal"

vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))
vi.mock("@/app/(app)/questions/page", () => ({ STATUSES: ["открыт"], PRIORITIES: ["средний"] }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [] }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))

const S = STRINGS as Record<string, string>
beforeEach(() => { vi.mocked(createLinksFor).mockReset() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function mount(targetType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}>
    <QuickAddQuestionModal open onClose={vi.fn()} targetType={targetType} targetId={7} targetLabel="Цель" />
  </QueryClientProvider>)
}
const has = (name: string) => !!screen.queryByRole("button", { name })
const submit = () => {
  fireEvent.change(screen.getByPlaceholderText(S["quickAddQuestion.questionPlaceholder"]), { target: { value: "Вопрос" } })
  fireEvent.submit(document.querySelector("form")!)
}

describe("QuickAddQuestionModal: типы связи по словарю пары", () => {
  it("родитель другого типа: «Подтверждает / Опровергает / Связано», влияния нет", () => {
    mount("observation")
    expect([S["linkType.confirms"], S["linkType.refutes"], S["linkType.related"]].every(has)).toBe(true)
    expect(has("Бросает вызов")).toBe(false)
  })

  it("родитель того же типа: только «Связано» и подсказка", () => {
    mount("question")
    expect(has(S["linkType.related"])).toBe(true)
    expect(has(S["linkType.confirms"])).toBe(false)
    expect(has(S["linkType.refutes"])).toBe(false)
    expect(screen.getByText(S["quickAdd.sameTypeNeutral"])).toBeTruthy()
  })

  it("родитель-убеждение: влияние и «Связано» без доказательных; выбранное влияние уходит в связь", async () => {
    mount("worldview")
    expect(WORLDVIEW_INFLUENCE.every(i => has(S[i.labelKey]))).toBe(true)
    expect(has(S["linkType.confirms"])).toBe(false)
    vi.spyOn(questionApi, "create").mockResolvedValue({ id: 9, text: "" } as never)
    fireEvent.click(screen.getByRole("button", { name: "Бросает вызов" }))
    submit()
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "question", 9, [expect.objectContaining({ type: "worldview", id: 7, link_type: "challenges" })]))
  })

  it("по умолчанию уходит «связано»", async () => {
    mount("observation")
    vi.spyOn(questionApi, "create").mockResolvedValue({ id: 9, text: "" } as never)
    submit()
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "question", 9, [expect.objectContaining({ type: "observation", id: 7, link_type: "связано" })]))
  })
})
