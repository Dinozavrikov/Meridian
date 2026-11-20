import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { useStore } from "@/lib/store"
import { Providers } from "./providers"

vi.mock("@/components/layout/auth-gate-modal", () => ({ AuthGateModal: () => null }))

describe("Providers и режим перевода", () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ translationScope: "ui" })
  })

  it("после монтирования подхватывает сохраненный режим", () => {
    localStorage.setItem("translation-scope:v1", "ui_and_content")
    render(<Providers><div /></Providers>)
    expect(useStore.getState().translationScope).toBe("ui_and_content")
  })

  it("без сохраненного режима остается интерфейс", () => {
    render(<Providers><div /></Providers>)
    expect(useStore.getState().translationScope).toBe("ui")
  })
})
