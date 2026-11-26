import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"

vi.mock("next/navigation", () => ({ permanentRedirect: vi.fn(), redirect: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: ComponentProps<"a">) => <a {...p}>{children}</a> }))
vi.mock("@/lib/maturity-model", async () => ({
  ...(await vi.importActual<typeof import("@/lib/maturity-model")>("@/lib/maturity-model")),
  useMaturityModel: () => ({ data: undefined }),
}))

import HomePage from "@/app/(site)/page"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"

const S = STRINGS as Record<string, string>
const h = (key: string) => screen.getByRole("heading", { level: 3, name: S[key] })

beforeEach(() => { useStore.setState({ user: null, locale: "ru" }) })
afterEach(cleanup)

describe("examples on the home page", () => {
  it("each example sits in its own card", () => {
    render(<HomePage />)
    const cases: [HTMLElement | null, string][] = [
      [h("sitePage.home.compute.maturity.titlePending").closest("li"), "sitePage.home.compute.maturity.example"],
      [h("sitePage.home.compute.independence.title").closest("li"), "sitePage.home.compute.independence.example"],
      [h("sitePage.home.compute.calibration.title").closest("li"), "sitePage.home.compute.calibration.example"],
      [h("sitePage.home.step.close.title").closest("li"), "sitePage.home.step.close.example"],
      [h("sitePage.home.audience.research.title").parentElement, "sitePage.home.audience.research.example"],
    ]
    for (const [box, key] of cases) {
      expect(S[key], key).toBeTruthy()
      expect(box?.textContent, key).toContain(S[key])
    }
    expect(screen.getAllByTestId("home-example")).toHaveLength(cases.length + 1)
  })

  it("the sandbox example leaves together with the filled source gap", () => {
    render(<HomePage />)
    const example = S["sitePage.home.sandbox.gap.source.example"]
    expect(screen.getByText(example)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(S["sitePage.home.sandbox.source.label"]), { target: { value: "x" } })
    expect(screen.queryByText(example)).toBeNull()
  })
})
