import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { LocaleSwitcher } from "./locale-switcher"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => `T:${key}` }))
vi.mock("@/lib/store", () => ({
  useStore: (sel: (s: unknown) => unknown) => sel({
    locale: "en", setLocale: vi.fn(), translationScope: "ui", setTranslationScope: vi.fn(),
  }),
}))

describe("переключатель языка", () => {
  it("все подписи меню идут через перевод, а подписи языков остаются как есть", () => {
    render(<LocaleSwitcher />)
    fireEvent.click(screen.getByRole("button", { name: "T:localeSwitcher.aria" }))
    for (const k of ["scopeTitle", "langTitle", "scope.ui", "scope.both", "scope.content"]) {
      expect(screen.getAllByText(`T:localeSwitcher.${k}`).length).toBeGreaterThan(0)
    }
    expect(screen.getByText("RU")).toBeTruthy()
  })
})
