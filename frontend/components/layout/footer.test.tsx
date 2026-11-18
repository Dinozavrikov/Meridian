import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

import { Footer } from "@/components/layout/footer"
import { REPO_URL } from "@/lib/project-links"

describe("Footer: версия продукта", () => {
  for (const variant of ["app", "public"] as const) {
    it(`вариант ${variant}: показывает версию из окружения сборки`, () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "7.8.9")
      render(<Footer variant={variant} />)
      expect(screen.getAllByText("v7.8.9").length).toBeGreaterThan(0)
    })
  }
})

describe("Footer: исходный код и поддержка", () => {
  for (const variant of ["app", "public"] as const) {
    it(`вариант ${variant}: ссылка на репозиторий открывается безопасно, а поддержка ведет на /support`, () => {
      const { container } = render(<Footer variant={variant} />)
      const repo = container.querySelector(`a[href="${REPO_URL}"]`)
      expect(repo, "ссылка на репозиторий").not.toBeNull()
      expect(repo!.getAttribute("target")).toBe("_blank")
      expect(repo!.getAttribute("rel")).toContain("noopener")
      const support = container.querySelector('a[href="/support"]')
      expect(support, "ссылка на /support").not.toBeNull()
      expect(support!.getAttribute("target")).toBeNull()
    })
  }
})
