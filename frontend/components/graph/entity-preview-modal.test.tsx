import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { safeEntityHref } from "@/lib/entity-routes"
import { EntityPreviewModal } from "@/components/entities/entity-preview-modal"

const h = vi.hoisted(() => ({ get: vi.fn(), result: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get }, resultApi: { get: h.result } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) => (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => p?.[k] ?? "") }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ prediction: "Прогноз" }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x }))
const S = STRINGS as Record<string, string>
const PREVIEW = { type: "prediction", id: 3, title: "Прогноз", excerpt: "Первый абзац\n\nВторой абзац", status: "подтвердился",
  author: { username: "u", display_name: "Ю" }, effect: { kind: "counted", value: 1.2 }, effects: [] }
const mount = (props: { type?: string; openRecord?: boolean } = {}) => render(
  <QueryClientProvider client={new QueryClient()}>
    <EntityPreviewModal type={props.type ?? "prediction"} id={3} onClose={() => {}} openRecord={props.openRecord} />
  </QueryClientProvider>)
beforeEach(() => { h.get.mockReset().mockResolvedValue({ data: PREVIEW }); h.result.mockReset() })
afterEach(cleanup)

describe("EntityPreviewModal (единая для всех графов)", () => {
  it("читает /preview, показывает чип эффекта и тексты из словаря", async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId("effect-chip")).toBeTruthy())
    expect(h.get).toHaveBeenCalledWith("/api/v1/prediction/3/preview")
    expect(screen.getByText(S["graphPreview.openProfile"])).toBeTruthy()
    expect(screen.getByText(S["graphPreview.openDiscussion"])).toBeTruthy()
  })
  it("абзацы переносятся (pre-line), теги не показываются", async () => {
    h.get.mockResolvedValue({ data: { ...PREVIEW, excerpt: "Первый абзац\n\nВторой абзац" } })
    mount()
    const el = await screen.findByText(/Первый абзац/)
    expect(el.style.whiteSpace).toBe("pre-line")
    expect(el.textContent).toContain("\n\n")
    expect(el.textContent).not.toContain("<p>")
  })
  it("«Открыть запись» только по openRecord и ведёт по safeEntityHref", async () => {
    mount({ openRecord: true })
    const a = (await screen.findByText(S["nodePreviewModal.openRecord"])).closest("a")!
    expect(a.getAttribute("href")).toBe(safeEntityHref("prediction", 3))
    cleanup(); mount()
    await screen.findByText(S["graphPreview.openProfile"])
    expect(screen.queryByText(S["nodePreviewModal.openRecord"])).toBeNull()
  })
  it("недоступная запись (404) — сообщение, а не пустая модалка", async () => {
    h.get.mockRejectedValue(new Error("404"))
    mount()
    expect(await screen.findByText(S["preview.unavailable"])).toBeTruthy()
  })
  it("результат берётся из resultApi, абзацы не слипаются, /preview не вызывается", async () => {
    h.result.mockResolvedValue({ title: "Р", body: "<p>Один</p><p>Два</p>", owner_username: "o", owner_display_name: "О" })
    mount({ type: "result" })
    const el = await screen.findByText(/Один/)
    expect(el.textContent).toBe("Один\n\nДва")
    expect(h.get).not.toHaveBeenCalled()
  })
})
