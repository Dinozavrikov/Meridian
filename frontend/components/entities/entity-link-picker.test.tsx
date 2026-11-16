import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { EntityLinkPicker, type PendingLink } from "@/components/entities/entity-link-picker"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn() } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение" }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))

const S = STRINGS as Record<string, string>
const RESULTS = [
  { type: "observation", id: 2, title: "Другое наблюдение", is_own: true },
  { type: "hypothesis", id: 3, title: "Гипотеза Икс", is_own: true },
]

beforeEach(() => { h.get.mockReset(); h.get.mockResolvedValue({ data: RESULTS }) })
afterEach(cleanup)

let last: PendingLink[] = []
function Harness() {
  const [value, setValue] = useState<PendingLink[]>([])
  return <EntityLinkPicker value={value} onChange={v => { last = v; setValue(v) }} excludeType="observation" excludeId={1} />
}
async function search() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>)
  fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "д" } })
  await screen.findByText("Гипотеза Икс")
}
const chip = (key: string) => screen.getByRole("button", { name: S[key] })

describe("EntityLinkPicker: записи одного типа", () => {
  it("по умолчанию («связано») запись того же типа находится и добавляется как «связано»", async () => {
    last = []
    await search()
    fireEvent.click(screen.getByText("Другое наблюдение"))
    await waitFor(() => expect(last).toHaveLength(1))
    expect(last[0]).toMatchObject({ type: "observation", id: 2, link_type: "связано" })
  })

  it("при «подтверждает» записи того же типа не показываются и есть подсказка, записи другого типа остаются", async () => {
    await search()
    fireEvent.click(chip("linkType.confirms"))
    expect(screen.queryByText("Другое наблюдение")).toBeNull()
    expect(screen.getByText(S["relations.sameTypeHidden"])).toBeTruthy()
    expect(screen.getByText("Гипотеза Икс")).toBeTruthy()
  })

  it("возврат на «связано» снова показывает запись того же типа и убирает подсказку", async () => {
    await search()
    fireEvent.click(chip("linkType.refutes"))
    fireEvent.click(chip("linkType.related"))
    expect(screen.getByText("Другое наблюдение")).toBeTruthy()
    expect(screen.queryByText(S["relations.sameTypeHidden"])).toBeNull()
  })

  it("запись другого типа при «подтверждает» добавляется именно с этим типом связи", async () => {
    last = []
    await search()
    fireEvent.click(chip("linkType.confirms"))
    fireEvent.click(screen.getByText("Гипотеза Икс"))
    await waitFor(() => expect(last).toHaveLength(1))
    expect(last[0]).toMatchObject({ type: "hypothesis", id: 3, link_type: "подтверждает" })
  })
})

function HarnessWorldview() {
  const [value, setValue] = useState<PendingLink[]>([])
  return <EntityLinkPicker value={value} onChange={v => { last = v; setValue(v) }} excludeType="worldview" excludeId={1} />
}

describe("EntityLinkPicker: страница убеждения", () => {
  it("чипы: влияние и «Связано» без доказательных; выбранное влияние уходит в связь и подписано словом, а не значением", async () => {
    last = []
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><HarnessWorldview /></QueryClientProvider>)
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual([...WORLDVIEW_INFLUENCE.map(i => S[i.labelKey]), S["linkType.related"]])
    expect(screen.queryByRole("button", { name: S["linkType.confirms"] })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Бросает вызов" }))
    fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "д" } })
    fireEvent.click(await screen.findByText("Гипотеза Икс"))
    await waitFor(() => expect(last).toHaveLength(1))
    expect(last[0]).toMatchObject({ type: "hypothesis", id: 3, link_type: "challenges" })
    expect(screen.queryByText("challenges")).toBeNull()
    expect(screen.getAllByText("Бросает вызов")).toHaveLength(2)
  })
})
