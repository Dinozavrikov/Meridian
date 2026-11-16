import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/contact"
import { CARD_GROUPS, SECTIONS } from "@/lib/terms"

vi.mock("@/lib/api", async orig => ({ ...(await orig<object>()), api: { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }) } }))

import { TermsBody } from "./TermsBody"
import { TermsHero } from "./TermsHero"

beforeEach(() => { useStore.setState({ locale: "ru" }) })

describe("страница условий", () => {
  it("разделы в документе идут в порядке оглавления", () => {
    const { container } = render(<TermsBody />)
    expect([...container.querySelectorAll("section[id]")].map(s => s.id)).toEqual([...SECTIONS])
  })
  it("все карточки на месте: каждая со своим заголовком и текстом", () => {
    const { container } = render(<TermsBody />)
    const cards = Object.values(CARD_GROUPS).reduce((n, ids) => n + ids.length, 0)
    expect(container.querySelectorAll("article").length).toBe(cards + 1)   // и карточка связи
    for (const [group, ids] of Object.entries(CARD_GROUPS))
      for (const id of ids) expect(screen.getAllByText(STRINGS[`termsPage.${group}.${id}.title`]).length, `${group}.${id}`).toBeGreaterThan(0)
  })
  it("в отрисованном тексте нет незаполненных подстановок, а почта подставлена", () => {
    const { container } = render(<TermsBody />)
    expect(container.textContent).not.toMatch(/\{\w+\}/)
    expect(container.textContent).toContain(`напишите нам: ${CONTACT_EMAIL}.`)
  })
  it("кнопка связи ведет на почту из единого источника", () => {
    render(<TermsBody />)
    expect(screen.getByRole("link", { name: c => c.includes(CONTACT_EMAIL) }).getAttribute("href")).toBe(CONTACT_HREF)
  })
  it("герой: номер редакции, дата по-русски и фраза о принятии условий", () => {
    render(<TermsHero />)
    expect(screen.getByText(/ред\. 2\.0/)).toBeTruthy()
    expect(screen.getByText(c => /^с .*2026/.test(c) && /ноября/.test(c))).toBeTruthy()
    expect(screen.getByText(STRINGS["termsPage.accept"])).toBeTruthy()
  })
})
