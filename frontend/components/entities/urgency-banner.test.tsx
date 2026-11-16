import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { UrgencyBanner } from "@/components/entities/urgency-banner"

vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
afterEach(cleanup)

describe("UrgencyBanner", () => {
  it("показывает заголовок и пояснение как статус", () => {
    render(<UrgencyBanner tone="#E74C3C" icon={<span />} title="Срок проверки — сегодня" description="Запишите исход" />)
    expect(screen.getByRole("status").textContent).toContain("Срок проверки — сегодня")
    expect(screen.getByText("Запишите исход")).toBeTruthy()
  })

  it("действие в плашке — кнопка, и клик по ней вызывает обработчик (раньше плашка была некликабельной)", () => {
    const onClick = vi.fn()
    render(<UrgencyBanner tone="#E74C3C" icon={<span />} title="t" action={{ label: "Записать исход", onClick, primary: true }} />)
    fireEvent.click(screen.getByRole("button", { name: "Записать исход" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("без действия кнопок нет", () => {
    render(<UrgencyBanner tone="#27AE60" icon={<span />} title="Готово" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
