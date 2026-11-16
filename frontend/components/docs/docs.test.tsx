import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"
import { MODEL, RESULT } from "@/lib/test-utils/maturity-model-fixture"

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", async orig => ({ ...(await orig<object>()), api: { get, post } }))

import { DocsProvider } from "./docs-context"
import { DocsFormula } from "./DocsFormula"
import { DocsCalculator } from "./DocsCalculator"
import { DocsFaq } from "./DocsFaq"
import { DocsHero } from "./DocsHero"

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocsProvider>{ui}</DocsProvider></QueryClientProvider>,
)
const sims = () => post.mock.calls.filter(c => String(c[0]).endsWith("/simulate"))   // post общий с переводом динамических строк
beforeEach(() => {
  useStore.setState({ locale: "ru" })   // десятичная запятая и тексты не должны зависеть от языка окружения
  get.mockReset().mockResolvedValue({ data: MODEL })
  post.mockReset().mockResolvedValue({ data: RESULT })
  window.location.hash = ""
})

describe("формула читает числа из ответа сервиса", () => {
  it("вес наблюдения и пороги берутся из модели, а не из текста", async () => {
    get.mockResolvedValue({ data: { ...MODEL, observation: { ...MODEL.observation, weight: 0.7 } } })
    wrap(<DocsFormula />)
    expect((await screen.findAllByText(c => c.includes("0,7"))).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("36")).length).toBeGreaterThan(0)   // порог четвертого уровня при риске 10: 18 × 2
  })
})

describe("калькулятор", () => {
  it("считает на сервере и показывает уровень из ответа", async () => {
    wrap(<DocsCalculator />)
    await waitFor(() => expect(sims().length).toBeGreaterThan(0))
    const body = sims()[0][1]
    expect(body.risk).toBe(5)
    expect(body.predictions).toHaveLength(2)
    expect((await screen.findByTestId("docs-calc-level")).textContent).toBe("1")
  })
  it("новый прогноз уходит в следующий запрос", async () => {
    wrap(<DocsCalculator />)
    fireEvent.click(await screen.findByRole("button", { name: `+ ${STRINGS["docsPage.calc.addPrediction"]}` }))
    await waitFor(() => expect(sims().at(-1)![1].predictions).toHaveLength(3), { timeout: 3000 })
  })
  it("при ошибке показывает сообщение и кнопку повтора, после повтора восстанавливается", async () => {
    post.mockRejectedValue(new Error("down"))
    wrap(<DocsCalculator />)
    const retry = await screen.findByRole("button", { name: STRINGS["docsPage.calc.retry"] }, { timeout: 3000 })
    post.mockResolvedValue({ data: RESULT })
    fireEvent.click(retry)
    expect(await screen.findByTestId("docs-calc-level", {}, { timeout: 3000 })).toBeTruthy()
  })
})

describe("вопросы и ответы", () => {
  const q = (id: string) => STRINGS[`docsPage.faq.item.${id}.q`]
  it("раскрываются по клику и ставят постоянную ссылку", () => {
    wrap(<DocsFaq />)
    const b = screen.getByRole("button", { name: q("slow") })
    expect(b.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(b)
    expect(b.getAttribute("aria-expanded")).toBe("true")
    expect(window.location.hash).toBe("#faq-slow")
  })
  it("переход по ссылке с якорем раскрывает нужный вопрос", () => {
    window.location.hash = "#faq-delete"
    wrap(<DocsFaq />)
    expect(screen.getByRole("button", { name: q("delete") }).getAttribute("aria-expanded")).toBe("true")
  })
})

describe("поиск", () => {
  it("находит вопрос по слову из ответа и ведет по якорю", () => {
    wrap(<DocsHero />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "корзина" } })
    const hrefs = screen.getAllByRole("link").map(a => a.getAttribute("href"))
    expect(hrefs).toContain("#faq-delete")
  })
})
