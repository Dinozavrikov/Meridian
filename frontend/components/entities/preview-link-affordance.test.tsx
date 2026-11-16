import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PreviewLink, PreviewLinkTitle } from "@/components/entities/preview-link"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))
afterEach(cleanup)

const mount = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <PreviewLink type="hypothesis" id={5} href="/hypotheses?id=5&tab=detail" className="extra">
      <PreviewLinkTitle fontSize={14}>Гипотеза А</PreviewLinkTitle>
    </PreviewLink>
  </QueryClientProvider>)

describe("название связи выглядит кликабельным", () => {
  it("подчёркнуто пунктиром и со стрелкой «открыть» внутри ссылки", () => {
    mount()
    const link = screen.getByRole("link", { name: "Гипотеза А" })
    expect(link.querySelector('[data-testid="preview-affordance"]')).not.toBeNull()
    const title = screen.getByText("Гипотеза А")
    expect(title.className).toMatch(/\bunderline\b/)
    expect(title.className).toMatch(/decoration-dotted/)
    expect(title.className).toMatch(/group-hover:decoration-solid/)
  })
  it("ссылка — группа для hover-стилей и сохраняет переданный className", () => {
    mount()
    const cls = screen.getByRole("link", { name: "Гипотеза А" }).className
    expect(cls).toMatch(/\bgroup\b/)
    expect(cls).toMatch(/\bextra\b/)
  })
  it("стрелка не попадает в доступное имя ссылки", () => {
    mount()
    expect(screen.getByRole("link").textContent?.trim()).toBe("Гипотеза А")
  })
})
