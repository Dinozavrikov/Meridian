import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

import { Footer } from "@/components/layout/footer"

describe("Footer: версия продукта", () => {
  for (const variant of ["app", "public"] as const) {
    it(`вариант ${variant}: показывает версию из окружения сборки`, () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "7.8.9")
      render(<Footer variant={variant} />)
      expect(screen.getAllByText("v7.8.9").length).toBeGreaterThan(0)
    })
  }
})
