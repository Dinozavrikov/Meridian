import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { ReflectionInsightPanel } from "@/components/entities/reflection-insight-panel"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(cleanup)
const S = STRINGS as Record<string, string>

const insight = { id: 1, matched: [], added: ["новый фактор"], dropped: [], insight: "Данных мало для вывода." }

describe("ReflectionInsightPanel: состояния", () => {
  it("готово: показывает заголовок, текст вывода и добавленные факторы", () => {
    render(<ReflectionInsightPanel insight={insight} />)
    expect(screen.getByText("Данных мало для вывода.")).toBeTruthy()
    expect(screen.getByText(S["reflectionInsight.title"])).toBeTruthy()
    expect(screen.getByText("новый фактор")).toBeTruthy()
  })

  it("ошибка: сообщение как alert и кнопка «Повторить» вызывает onRetry", () => {
    const onRetry = vi.fn()
    render(<ReflectionInsightPanel insight={null} error onRetry={onRetry} />)
    expect(screen.getByRole("alert").textContent).toContain(S["reflectionInsight.error"])
    fireEvent.click(screen.getByRole("button", { name: S["reflectionInsight.retry"] }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("ошибка важнее старого значения: текст прошлого вывода не показывается", () => {
    render(<ReflectionInsightPanel insight={insight} error />)
    expect(screen.queryByText("Данных мало для вывода.")).toBeNull()
  })

  it("загрузка — статус, пусто — подсказка", () => {
    render(<ReflectionInsightPanel insight={null} loading />)
    expect(screen.getByRole("status").textContent).toContain(S["reflectionInsight.comparing"])
    cleanup()
    render(<ReflectionInsightPanel insight={null} emptyHint="Нечего сравнивать" />)
    expect(screen.getByText("Нечего сравнивать")).toBeTruthy()
  })
})
