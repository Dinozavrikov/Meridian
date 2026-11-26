import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"
import { DIVERSITY_CARDS } from "@/lib/docs"
import { MODEL } from "@/lib/test-utils/maturity-model-fixture"

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", async orig => ({ ...(await orig<object>()), api: { get, post } }))

import { DocsProvider } from "./docs-context"
import { DocsCards } from "./DocsCards"

beforeEach(() => {
  useStore.setState({ locale: "ru" })
  get.mockReset().mockResolvedValue({ data: MODEL })
  post.mockReset().mockResolvedValue({ data: {} })
})

describe("examples in the documentation", () => {
  it("diversity cards show their examples", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DocsProvider><DocsCards ns="diversity" cards={DIVERSITY_CARDS} /></DocsProvider>
      </QueryClientProvider>,
    )
    for (const id of ["what", "effect"]) {
      const text = (STRINGS as Record<string, string>)[`docsPage.diversity.${id}.example`]
      const card = screen.getByRole("heading", { name: (STRINGS as Record<string, string>)[`docsPage.diversity.${id}.title`] }).closest("article")
      expect(text, id).toBeTruthy()
      expect(card?.textContent, id).toContain(text)
    }
  })
})
