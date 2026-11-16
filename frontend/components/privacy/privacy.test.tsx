import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/contact"
import { FACTS } from "@/lib/test-utils/privacy-facts-fixture"

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", async orig => ({ ...(await orig<object>()), api: { get, post: vi.fn().mockResolvedValue({ data: {} }) } }))

import { PrivacyProvider } from "./privacy-context"
import { PrivacyHero } from "./PrivacyHero"
import { PrivacyContact, PrivacyData, PrivacyStorage } from "./PrivacySections"

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PrivacyProvider>{ui}</PrivacyProvider></QueryClientProvider>,
)
beforeEach(() => {
  useStore.setState({ locale: "ru" })
  get.mockReset().mockResolvedValue({ data: FACTS })
})

describe("страница приватности берет сроки с сервера", () => {
  it("таблица кук: имена и сроки из ответа, форма слова по числу", async () => {
    get.mockResolvedValue({ data: { ...FACTS, cookies: [
      { name: "access_token", purpose: "access", ttl_seconds: 60 },
      { name: "refresh_token", purpose: "refresh", ttl_seconds: 7 * 86400 },
      { name: "google_oauth_state", purpose: "oauth_state", ttl_seconds: 120 },
    ] } })
    wrap(<PrivacyStorage />)
    expect(await screen.findByText("1 минута")).toBeTruthy()
    expect(screen.getByText("7 дней")).toBeTruthy()
    expect(screen.getByText("2 минуты")).toBeTruthy()
    expect(screen.getByText("refresh_token")).toBeTruthy()
  })
  it("срок входа в таблице данных подставляется из настроек, а не пишется в тексте", async () => {
    get.mockResolvedValue({ data: { ...FACTS, session: { access_minutes: 15, refresh_days: 21 } } })
    wrap(<PrivacyData />)
    expect(await screen.findByText(c => c.includes("окончания срока входа (21 день)"))).toBeTruthy()
    expect(screen.queryByText(c => c.includes("30 дней"))).toBeNull()
  })
  it("пока сроки не пришли, на их месте многоточие, а не пустота и не цифра из головы", () => {
    get.mockReturnValue(new Promise(() => {}))
    wrap(<PrivacyData />)
    expect(screen.getByText(c => c.includes("окончания срока входа (…)"))).toBeTruthy()
  })
  it("если сроки не загрузились, герой говорит об этом", async () => {
    get.mockRejectedValue(new Error("down"))
    wrap(<PrivacyHero />)
    expect((await screen.findByRole("alert", {}, { timeout: 3000 })).textContent).toBe(STRINGS["privacyPage.modelError"])
  })
})

describe("связь", () => {
  it("кнопка ведет на почту из единого источника", () => {
    wrap(<PrivacyContact />)
    const link = screen.getByRole("link", { name: c => c.includes(CONTACT_EMAIL) })
    expect(link.getAttribute("href")).toBe(CONTACT_HREF)
    expect(CONTACT_HREF).toBe(`mailto:${CONTACT_EMAIL}`)
  })
})

describe("герой", () => {
  it("номер редакции и дата выводятся по-русски", () => {
    wrap(<PrivacyHero />)
    expect(screen.getByText(/ред\. 2\.0/)).toBeTruthy()
    expect(screen.getByText(c => /^с .*2026/.test(c) && /ноября/.test(c))).toBeTruthy()
    expect(within(document.body).getByRole("heading", { level: 1 }).textContent).toBe(STRINGS["privacyPage.hero.title"])
  })
})
