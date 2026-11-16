import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Users } from "lucide-react"
import { AccessBand } from "@/components/entities/access-band"

const action = (onClick = vi.fn()) => ({ label: "Закрыть доступ", onClick })

describe("AccessBand", () => {
  it("показывает заголовок, подсказку и зовёт действие", () => {
    const onClick = vi.fn()
    render(<AccessBand icon={Users} title="Открыта лаборатории «Лаба»" hint="Только чтение" action={action(onClick)} />)
    expect(screen.getByText("Открыта лаборатории «Лаба»")).toBeTruthy()
    expect(screen.getByText("Только чтение")).toBeTruthy()
    fireEvent.click(screen.getByText("Закрыть доступ"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it("expireAfter: сначала схлопывается, затем зовёт onExpire", async () => {
    const onExpire = vi.fn()
    render(<AccessBand icon={Users} title="t" action={action()} expireAfter={20} onExpire={onExpire} />)
    expect(screen.getByTestId("access-band").getAttribute("data-collapsed")).toBe("false")
    await vi.waitFor(() => expect(screen.getByTestId("access-band").getAttribute("data-collapsed")).toBe("true"))
    expect(onExpire).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1))
  })
  it("без expireAfter не схлопывается и onExpire не зовётся", async () => {
    const onExpire = vi.fn()
    render(<AccessBand icon={Users} title="t" action={action()} onExpire={onExpire} />)
    await new Promise(r => setTimeout(r, 80))
    expect(screen.getByTestId("access-band").getAttribute("data-collapsed")).toBe("false")
    expect(onExpire).not.toHaveBeenCalled()
  })
  it("disabled-действие не срабатывает", () => {
    const onClick = vi.fn()
    render(<AccessBand icon={Users} title="t" action={{ label: "Закрыть доступ", onClick, disabled: true }} />)
    fireEvent.click(screen.getByText("Закрыть доступ"))
    expect(onClick).not.toHaveBeenCalled()
  })
})
