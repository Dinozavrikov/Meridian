import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { LinkLockNotice } from "@/components/entities/link-lock-notice"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
afterEach(cleanup)
const S = STRINGS as Record<string, string>

describe("LinkLockNotice", () => {
  it("закрытый прогноз: заголовок, статус и объяснение", () => {
    render(<LinkLockNotice lock={{ code: "pred_closed", status: "частично подтвердился" }} />)
    expect(screen.getByText(S["relations.lock.pred_closed.title"])).toBeTruthy()
    expect(screen.getByText("частично подтвердился")).toBeTruthy()
    expect(screen.getByText(S["relations.lock.pred_closed.text"])).toBeTruthy()
  })
  it("чужая связь: свой текст, без статуса", () => {
    render(<LinkLockNotice lock={{ code: "other_author" }} />)
    expect(screen.getByText(S["relations.lock.other_author.text"])).toBeTruthy()
    expect(screen.queryByText(S["relations.lock.outcome"])).toBeNull()
  })
  it("неизвестный код ничего не рисует", () => {
    const { container } = render(<LinkLockNotice lock={{ code: "x" }} />)
    expect(container.firstChild).toBeNull()
  })
})
