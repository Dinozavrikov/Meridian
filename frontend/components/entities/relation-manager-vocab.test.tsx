import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"
import { RelationManager } from "@/components/entities/relation-manager"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), put: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: h.del, put: h.put } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", worldview: "Убеждение" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({
    isLoading: false,
    data: { related: {
      worldview: [{ id: 11, title: "Убеждение А", link_type: "подтверждает", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null }],
      hypothesis: [{ id: 5, title: "Гипотеза Б", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null, status: "идея" }],
    } },
  }),
}))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [
    { value: "подтверждает", label: "Подтверждает", color: "#2ECC71" },
    { value: "опровергает", label: "Опровергает", color: "#E74C3C" },
    { value: "связано", label: "Связано", color: "#4A90D9" },
  ],
}))
const S = STRINGS as Record<string, string>
const INFLUENCE_LABELS = WORLDVIEW_INFLUENCE.map(i => S[i.labelKey])

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.del.mockReset(); h.put.mockReset()
  h.get.mockResolvedValue({ data: [] }); h.put.mockResolvedValue({ data: {} })
})
afterEach(cleanup)

function mount(entityType: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><RelationManager entityType={entityType} entityId={1} /></QueryClientProvider>)
}

describe("RelationManager: словарь типов связи по паре", () => {
  it("строка убеждения: меню типа даёт влияние и «Связано», выбор уходит запросом с этим влиянием", async () => {
    mount("hypothesis")
    const opener = screen.getAllByRole("button", { name: S["relations.changeType"] }).find(b => b.textContent?.includes("Подтверждает"))!
    fireEvent.click(opener)
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitemradio").map(b => b.textContent)).toEqual([...INFLUENCE_LABELS, "Связано"])
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Бросает вызов" }))
    await waitFor(() => expect(h.put).toHaveBeenCalled())
    expect(h.put.mock.calls[0][0]).toContain("to_type=worldview&to_id=11&link_type=challenges")
  })

  it("строка обычной записи (другой тип): меню прежнее, три типа связи", async () => {
    mount("observation")
    const opener = screen.getAllByRole("button", { name: S["relations.changeType"] }).find(b => b.textContent?.includes("Связано"))!
    fireEvent.click(opener)
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitemradio").map(b => b.textContent)).toEqual(["Подтверждает", "Опровергает", "Связано"])
  })

  it("на странице убеждения типы связи для добавления: влияние и «Связано»", () => {
    mount("worldview")
    const group = screen.getAllByRole("group", { name: S["relations.linkTypeLabel"] })[0]
    expect(within(group).getAllByRole("button").map(b => b.textContent)).toEqual([...INFLUENCE_LABELS, "Связано"])
  })
})

describe("RelationManager: пакетная смена типа по словарю пары", () => {
  const batchButton = (name: string) =>
    within(screen.getByText(S["relations.batch.setType"]).parentElement as HTMLElement).getByRole("button", { name }) as HTMLButtonElement
  const pick = (i: number) => fireEvent.click(screen.getAllByRole("checkbox")[i])

  it("выбрана связь с убеждением: влияние и «Связано» доступны, «Подтверждает/Опровергает» нет", () => {
    mount("hypothesis")
    pick(1)
    expect(batchButton("Бросает вызов").disabled).toBe(false)
    expect(batchButton("Связано").disabled).toBe(false)
    expect(batchButton("Подтверждает").disabled).toBe(true)
    expect(batchButton("Опровергает").disabled).toBe(true)
  })

  it("выбрана связь с записью того же типа: доступно только «Связано»", () => {
    mount("hypothesis")
    pick(2)
    expect(batchButton("Связано").disabled).toBe(false)
    expect(batchButton("Подтверждает").disabled).toBe(true)
    expect(batchButton("Укрепляет").disabled).toBe(true)
  })

  it("выбор влияния уходит в пробный запуск пакета с этим типом", async () => {
    mount("hypothesis")
    pick(1)
    fireEvent.click(batchButton("Бросает вызов"))
    await waitFor(() => expect(h.post).toHaveBeenCalled())
    const [url, body] = h.post.mock.calls[0]
    expect(url).toContain("/links/batch/preview")
    expect(body.ops[0]).toMatchObject({ op: "set_type", other_type: "worldview", other_id: 11, link_type: "challenges" })
  })
})
