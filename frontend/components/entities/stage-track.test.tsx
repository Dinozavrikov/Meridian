import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { StageTrack } from "@/components/entities/stage-track"

// Настоящий useT подставляет {параметры}; повторяем это, чтобы проверять итоговый текст подтверждения.
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))

const st = vi.hoisted(() => ({
  stage: null as string | null, isLoading: false, isPending: false, isError: false, setStage: vi.fn(),
}))
vi.mock("@/lib/use-entity-stage", () => ({ useEntityStage: () => st }))

const S = STRINGS as Record<string, string>
const mount = (isOwner: boolean) => render(<StageTrack entityType="observation" entityId={1} isOwner={isOwner} />)
const row = (stage: string) => screen.getByRole("button", { name: S[`stagePanel.stage.${stage}`] })

beforeEach(() => { Object.assign(st, { stage: null, isLoading: false, isPending: false, isError: false }); st.setStage.mockClear() })
afterEach(cleanup)

describe("StageTrack: вертикальный путь с подтверждением", () => {
  it("пока грузится — ничего не рисует; чужая запись без стадии — тоже", () => {
    st.isLoading = true
    expect(mount(true).container.firstChild).toBeNull()
    cleanup(); st.isLoading = false
    expect(mount(false).container.firstChild).toBeNull()
  })

  it("все 8 стадий видны с названиями", () => {
    mount(true)
    for (const s of ["question", "research", "experiments", "prototype", "real_world_testing", "evidence", "proven_product", "market_handoff"]) {
      expect(screen.getByText(S[`stagePanel.stage.${s}`])).toBeTruthy()
    }
  })

  it("не отслеживается: нажатие просит подтвердить «начать путь» и ничего не сохраняет, пока не подтвердят", () => {
    mount(true)
    fireEvent.click(row("experiments"))
    expect(screen.getByText("Начать путь со стадии «Эксперименты»?")).toBeTruthy()
    expect(st.setStage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: S["stagePanel.confirm"] }))
    expect(st.setStage).toHaveBeenCalledTimes(1)
    expect(st.setStage.mock.calls[0][0]).toBe("experiments")
  })

  it("вперёд и назад формулируются по-разному", () => {
    st.stage = "research"
    mount(true)
    fireEvent.click(row("real_world_testing"))
    expect(screen.getByText("Перевести на стадию «Проверка на практике»?")).toBeTruthy()
    fireEvent.click(row("question"))
    expect(screen.getByText("Вернуть на стадию «Вопрос»?")).toBeTruthy()
  })

  it("отмена закрывает подтверждение и ничего не сохраняет; Escape делает то же", () => {
    st.stage = "research"
    mount(true)
    fireEvent.click(row("prototype"))
    fireEvent.click(screen.getByRole("button", { name: S["stagePanel.cancel"] }))
    expect(screen.queryByText(S["stagePanel.confirm"])).toBeNull()
    fireEvent.click(row("prototype"))
    fireEvent.keyDown(screen.getByTestId("stage-track"), { key: "Escape" })
    expect(screen.queryByText(S["stagePanel.confirm"])).toBeNull()
    expect(st.setStage).not.toHaveBeenCalled()
  })

  it("нажатие на текущую стадию ничего не открывает; текущая помечена", () => {
    st.stage = "research"
    mount(true)
    expect(row("research").getAttribute("aria-current")).toBe("step")
    fireEvent.click(row("research"))
    expect(screen.queryByText(S["stagePanel.confirm"])).toBeNull()
    expect(screen.getByText("2/8")).toBeTruthy()
  })

  it("чужая запись со стадией: видно, где она, менять нельзя", () => {
    st.stage = "prototype"
    mount(false)
    expect(screen.getByText("4/8")).toBeTruthy()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("пока сохраняется — кнопки заблокированы; при ошибке она показана", () => {
    st.stage = "research"; st.isError = true
    mount(true)
    fireEvent.click(row("prototype"))
    cleanup()
    st.isPending = true
    mount(true)
    fireEvent.click(screen.getAllByRole("button")[0])
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("alert").textContent).toBe(S["stagePanel.saveFailed"])
  })
})
