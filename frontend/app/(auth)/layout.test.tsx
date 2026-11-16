import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import AuthLayout from "./layout"
import { useStore } from "@/lib/store"

function setBrowserLang(lang: string) {
  Object.defineProperty(navigator, "language", { value: lang, configurable: true })
}

describe("AuthLayout — язык браузера на auth-страницах", () => {
  beforeEach(() => { useStore.setState({ locale: "ru" }) })
  afterEach(() => { setBrowserLang("en-US") })

  it("форсит язык браузера, даже если в памяти остался выбор из (app)", async () => {
    useStore.setState({ locale: "en" })
    setBrowserLang("de-DE")
    render(<AuthLayout><div /></AuthLayout>)
    await waitFor(() => expect(useStore.getState().locale).toBe("de"))
  })

  it("не трогает locale, если он уже совпадает с языком браузера", async () => {
    setBrowserLang("fr-FR")
    useStore.setState({ locale: "fr" })
    render(<AuthLayout><div /></AuthLayout>)
    await waitFor(() => expect(useStore.getState().locale).toBe("fr"))
  })
})
