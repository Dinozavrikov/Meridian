import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"

const nav = vi.hoisted(() => ({ permanent: vi.fn(), temporary: vi.fn() }))
const model = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock("next/navigation", () => ({ permanentRedirect: nav.permanent, redirect: nav.temporary }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: ComponentProps<"a">) => <a {...p}>{children}</a> }))
vi.mock("@/lib/maturity-model", async () => ({
  ...(await vi.importActual<typeof import("@/lib/maturity-model")>("@/lib/maturity-model")),
  useMaturityModel: () => ({ data: model.data }),
}))

import HomePage from "@/app/(site)/page"
import { HomeSandbox } from "@/components/site/home-sandbox"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"
import { HOME_KEYS, SECTION_KEYS } from "@/lib/site/home"
import { GAP_IDS, SANDBOX_ID, SANDBOX_KEYS as K, gapKeys } from "@/lib/site/sandbox"

const S = STRINGS as Record<string, string>
const fill = (key: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), S[key])
// Границы нарочно не 0 и 100: так видно, что ползунок берет их из модели.
const MODEL = { levels: { min: 0, max: 4, base_thresholds: [] }, prediction: { confidence_floor_pct: 5, confidence_ceil_pct: 95, default_confidence: 60 } }
const CLAIM = "Угол сыреет из-за вентиляции"
const SOURCE = "Замерил влажность"

const progress = (done: number) => fill(K.progress, { done, total: GAP_IDS.length })
const field = (key: string) => screen.getByLabelText(S[key])
const enter = (key: string, value: string) => fireEvent.change(field(key), { target: { value } })
const slider = () => field(K.confidenceLabel) as HTMLInputElement
const button = (key: string) => screen.getByRole("button", { name: S[key] }) as HTMLButtonElement
const fillAll = () => {
  enter(K.claimLabel, CLAIM)
  enter(K.sourceLabel, SOURCE)
  enter(K.refutationLabel, "Влажность не изменится после проветривания")
  enter(K.deadlineLabel, "2027-01-31")
}
const freezeDate = () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 10, 26, 0, 30))
}
function captureDownload() {
  const blobs: { text: string; type: string }[] = []
  const clicks: { download: string; href: string }[] = []
  vi.stubGlobal("Blob", class { constructor(parts: unknown[], opts?: { type?: string }) { blobs.push({ text: parts.map(String).join(""), type: opts?.type ?? "" }) } })
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:test"), configurable: true, writable: true })
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true, writable: true })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href })
  })
  return { blobs, clicks }
}
function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  return writeText
}

beforeEach(() => { useStore.setState({ user: null }); model.data = undefined })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  for (const k of ["clipboard", "sendBeacon"]) Reflect.deleteProperty(navigator, k)
  Reflect.deleteProperty(document, "cookie")
})

describe("песочница на главной", () => {
  it("ползунок берет границы и начальное положение из модели", () => {
    model.data = MODEL
    render(<HomeSandbox />)
    expect(slider().min).toBe("5")
    expect(slider().max).toBe("95")
    expect(slider().value).toBe("60")
    expect(slider().disabled).toBe(false)
  })

  it("пока модель грузится, ползунок отключен, а поля работают", () => {
    render(<HomeSandbox />)
    expect(slider().disabled).toBe(true)
    enter(K.sourceLabel, SOURCE)
    expect(screen.getByText(progress(1))).toBeTruthy()
  })

  it("пока уверенность не выбрана, процентов нет", () => {
    model.data = MODEL
    render(<HomeSandbox />)
    expect(screen.getByText(S[K.confidenceIdle])).toBeTruthy()
    expect(screen.getByText(S[K.confidenceHelp])).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\d%/)
    fireEvent.change(slider(), { target: { value: "70" } })
    expect(screen.getByText(fill(K.confidenceValue, { pct: 70 }))).toBeTruthy()
    expect(screen.queryByText(S[K.confidenceIdle])).toBeNull()
  })

  it("на краях шкалы есть подсказка, в середине ее нет", () => {
    model.data = MODEL
    render(<HomeSandbox />)
    const hints = () => [S[K.edgeLow], S[K.edgeHigh]].map(h => screen.queryByText(h) !== null)
    expect(hints()).toEqual([false, false])
    fireEvent.change(slider(), { target: { value: "5" } })
    expect(hints()).toEqual([true, false])
    fireEvent.change(slider(), { target: { value: "50" } })
    expect(hints()).toEqual([false, false])
    fireEvent.change(slider(), { target: { value: "95" } })
    expect(hints()).toEqual([false, true])
  })

  it("доля заполненного считается по непустым полям", () => {
    render(<HomeSandbox />)
    expect(screen.getByText(progress(0))).toBeTruthy()
    enter(K.sourceLabel, "   ")
    expect(screen.getByText(progress(0))).toBeTruthy()
    enter(K.sourceLabel, SOURCE)
    expect(screen.getByText(progress(1))).toBeTruthy()
    enter(K.deadlineLabel, "2027-01-31")
    expect(screen.getByText(progress(2))).toBeTruthy()
    enter(K.refutationLabel, "Влажность не изменится после проветривания")
    expect(screen.getByText(progress(GAP_IDS.length))).toBeTruthy()
    expect(GAP_IDS.length).toBe(3)
  })

  it("незаполненные пробелы показаны вопросом и строкой про Meridian", () => {
    render(<HomeSandbox />)
    for (const id of GAP_IDS) {
      expect(screen.getByText(S[gapKeys(id).question])).toBeTruthy()
      expect(screen.getByText(S[gapKeys(id).note])).toBeTruthy()
    }
    enter(K.sourceLabel, SOURCE)
    expect(screen.queryByText(S[gapKeys("source").question])).toBeNull()
    expect(screen.queryByText(S[gapKeys("source").note])).toBeNull()
    expect(screen.getByText(S[gapKeys("refutation").question])).toBeTruthy()
  })

  it("сначала просят утверждение, когда все заполнено, пробелов нет", () => {
    render(<HomeSandbox />)
    expect(screen.getByText(S[K.claimFirst])).toBeTruthy()
    fillAll()
    expect(screen.queryByText(S[K.claimFirst])).toBeNull()
    expect(screen.getByText(S[K.allFilled])).toBeTruthy()
    expect(screen.queryByText(S[K.gapsTitle])).toBeNull()
  })

  it("без утверждения скачать и скопировать нельзя", () => {
    render(<HomeSandbox />)
    expect([button(K.download).disabled, button(K.copy).disabled]).toEqual([true, true])
    enter(K.claimLabel, "   ")
    expect([button(K.download).disabled, button(K.copy).disabled]).toEqual([true, true])
    enter(K.claimLabel, CLAIM)
    expect([button(K.download).disabled, button(K.copy).disabled]).toEqual([false, false])
  })

  it("скачанный файл содержит введенное и дату по местному времени", () => {
    freezeDate()
    const cap = captureDownload()
    model.data = MODEL
    render(<HomeSandbox />)
    enter(K.claimLabel, CLAIM)
    enter(K.sourceLabel, SOURCE)
    enter(K.deadlineLabel, "2027-01-31")
    fireEvent.change(slider(), { target: { value: "70" } })
    fireEvent.click(button(K.download))
    expect(cap.blobs).toHaveLength(1)
    expect(cap.blobs[0].type).toBe("text/markdown;charset=utf-8")
    const text = cap.blobs[0].text
    for (const part of [CLAIM, SOURCE, "2027-01-31", fill(K.confidenceValue, { pct: 70 }), fill(K.mdExported, { date: "2026-11-26" })]) expect(text).toContain(part)
    expect(text).toContain(`- ${S[gapKeys("refutation").label]}: ${S[gapKeys("refutation").question]}`)
    expect(text).not.toContain(`- ${S[gapKeys("source").label]}:`)
    expect(cap.clicks).toEqual([{ download: "idea-check-2026-11-26.md", href: "blob:test" }])
  })

  it("в буфер уходит тот же текст, что в файл", async () => {
    freezeDate()
    const cap = captureDownload()
    const writeText = stubClipboard()
    model.data = MODEL
    render(<HomeSandbox />)
    fillAll()
    fireEvent.change(slider(), { target: { value: "70" } })
    fireEvent.click(button(K.download))
    fireEvent.click(button(K.copy))
    await waitFor(() => expect(screen.getByText(S[K.copied])).toBeTruthy())
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(cap.blobs[0].text)
  })

  it("без буфера обмена копирование сообщает об этом", async () => {
    render(<HomeSandbox />)
    enter(K.claimLabel, CLAIM)
    fireEvent.click(button(K.copy))
    await waitFor(() => expect(screen.getByText(S[K.copyFailed])).toBeTruthy())
  })

  it("введенный текст никуда не отправляется и нигде не сохраняется", async () => {
    model.data = MODEL
    captureDownload()
    const writeText = stubClipboard()
    render(<HomeSandbox />)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open")
    const store = vi.spyOn(Storage.prototype, "setItem")
    const beacon = vi.fn()
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true })
    const cookie = vi.fn()
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: cookie })
    fillAll()
    fireEvent.change(slider(), { target: { value: "70" } })
    fireEvent.click(button(K.download))
    fireEvent.click(button(K.copy))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    expect(store).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(cookie).not.toHaveBeenCalled()
  })
})

describe("кнопка перехода к песочнице", () => {
  it("кнопка первого экрана ведет к разделу, который есть на странице", () => {
    const { container } = render(<HomePage />)
    const link = screen.getByRole("link", { name: S[HOME_KEYS.ctaSandbox] })
    expect(link.getAttribute("href")).toBe(`#${SANDBOX_ID}`)
    const target = container.querySelector(`#${SANDBOX_ID}`)
    expect(target).not.toBeNull()
    expect(target!.querySelector("h2")?.textContent).toBe(S[SECTION_KEYS.sandbox.title])
    const anchors = [...container.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute("href") as string)
    expect(anchors.filter(h => container.querySelector(h) === null)).toEqual([])
  })

  it("кнопка есть и у вошедшего, на первом экране она одна", () => {
    useStore.setState({ user: { id: 1, username: "a" } as never })
    render(<HomePage />)
    expect(screen.getAllByRole("link", { name: S[HOME_KEYS.ctaSandbox] })).toHaveLength(1)
  })
})
