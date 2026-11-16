import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { LabDeleteButton } from "@/components/labs/lab-delete-button"
import { buildTrashConfirmText } from "@/lib/trash-confirm"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})

const S = STRINGS as Record<string, string>
const tt = (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), S[key] ?? key)
const ENTITY = { id: 5, title: "Мой прогноз", visibility: "lab", lab_id: 3 }

function setup(remove: (id: number) => Promise<unknown>, onDone = vi.fn(), onOuterClick = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <div onClick={onOuterClick}>
        <LabDeleteButton entityType="prediction" entity={ENTITY} remove={remove} onDone={onDone} />
      </div>
    </QueryClientProvider>,
  )
  return { onDone, onOuterClick }
}
const click = () => fireEvent.click(screen.getByRole("button", { name: S["labTabs.deleteAria"] }))

describe("кнопка удаления в лаборатории", () => {
  it("подтверждение — тот же текст, что на странице сущности, и для прогноза напоминает про калибровку", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    setup(vi.fn())
    click()
    expect(confirm).toHaveBeenCalledWith(buildTrashConfirmText(tt, "prediction", ENTITY))
    expect(String(confirm.mock.calls[0][0])).toContain("калибровк")
  })

  it("отказ в подтверждении ничего не удаляет", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const remove = vi.fn().mockResolvedValue({})
    setup(remove)
    click()
    await new Promise(r => setTimeout(r, 30))
    expect(remove).not.toHaveBeenCalled()
  })

  it("подтверждение удаляет по id и сообщает родителю, что список надо обновить", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const remove = vi.fn().mockResolvedValue({})
    const { onDone } = setup(remove)
    click()
    await waitFor(() => expect(remove).toHaveBeenCalledWith(5))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it("ошибка сервера: сообщение, список не обновляется", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const { onDone } = setup(vi.fn().mockRejectedValue(new Error("500")))
    click()
    expect((await screen.findByRole("alert")).textContent).toBe(S["labTabs.deleteError"])
    expect(onDone).not.toHaveBeenCalled()
  })

  it("клик по корзине не открывает карточку под ней", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const { onOuterClick } = setup(vi.fn())
    click()
    expect(onOuterClick).not.toHaveBeenCalled()
  })
})
