import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api, API_BASE_URL } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { formatFileSize } from "@/lib/attachments"
import { LabFilesTab } from "@/components/labs/lab-files-tab"
import type { LabFile, LabFilesResponse } from "@/lib/lab-files-api"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "ru" }) }))
vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      React.createElement("a", { href, ...rest }, children as never),
  }
})

const S = STRINGS as Record<string, string>
const tt = (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), S[key] ?? key)

const F = (over: Partial<LabFile> = {}): LabFile => ({
  kind: "attachment", id: 1, name: "a.txt", file_kind: "code", mime_type: "text/plain", size_bytes: 2048,
  created_at: "2026-10-06T10:00:00Z", entity_type: "observation", entity_id: 5, entity_title: "Моё наблюдение",
  uploader_id: 1, uploader_username: "alexey", download_url: "/api/v1/attachments/1/download", url: null, thumb_url: null, ...over,
})
const IMG = F({
  kind: "image", id: 7, name: "Фото установки", file_kind: "image", mime_type: null, download_url: null,
  url: "/api/uploads/entity_images/x.jpg", thumb_url: "/api/uploads/entity_images/x_t.jpg",
  entity_type: "hypothesis", entity_id: 9, entity_title: "Гипотеза А", created_at: "2026-10-05T10:00:00Z",
})
const SECOND = F({ id: 2, name: "b.csv", entity_type: "hypothesis", entity_id: 9, entity_title: "Гипотеза А", created_at: "2026-10-04T10:00:00Z" })

function setup(resp: Partial<LabFilesResponse> | Error) {
  const get = vi.spyOn(api, "get").mockImplementation((async () => {
    if (resp instanceof Error) throw resp
    const items = resp.items ?? []
    return { data: { items, count: items.length, truncated: false, total_bytes: 0, ...resp } }
  }) as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><LabFilesTab labId={5} /></QueryClientProvider>)
  return { get }
}

describe("вкладка «Файлы» лаборатории", () => {
  it("строка: имя, размер, кто загрузил, плашка записи со ссылкой на файлы этой записи, скачивание", async () => {
    const { get } = setup({ items: [F()], total_bytes: 2048 })
    expect(await screen.findByText("a.txt")).toBeTruthy()
    expect(get).toHaveBeenCalledWith("/api/v1/labs/5/files")
    const row = screen.getByTestId("lab-file-row")
    expect(row.textContent).toContain(formatFileSize(2048, tt))
    expect(row.textContent).toContain("alexey")
    const entity = within(row).getByText(/Моё наблюдение/).closest("a") as HTMLAnchorElement
    expect(entity.getAttribute("href")).toBe("/observations?id=5&tab=images")
    expect(entity.textContent).toContain(S["labCheckpoints.type.observation"])
    const download = within(row).getByText(S["labFiles.row.download"]).closest("a") as HTMLAnchorElement
    expect(download.getAttribute("href")).toBe(`${API_BASE_URL}/api/v1/attachments/1/download`)
    expect(download.hasAttribute("download")).toBe(true)
  })

  it("картинка: миниатюра и «Открыть» в новой вкладке без передачи opener", async () => {
    setup({ items: [IMG] })
    const img = (await screen.findByAltText("Фото установки")) as HTMLImageElement
    expect(img.getAttribute("src")).toBe(`${API_BASE_URL}/api/uploads/entity_images/x_t.jpg`)
    const open = screen.getByText(S["labFiles.row.open"]).closest("a") as HTMLAnchorElement
    expect(open.getAttribute("href")).toBe(`${API_BASE_URL}/api/uploads/entity_images/x.jpg`)
    expect(open.getAttribute("target")).toBe("_blank")
    expect(open.getAttribute("rel")).toContain("noopener")
  })

  it("фильтр по типу записи скрывает остальное, «Все» возвращает", async () => {
    setup({ items: [F(), IMG] })
    await screen.findByText("a.txt")
    fireEvent.click(screen.getByRole("button", { name: new RegExp(S["labCheckpoints.typePlural.hypothesis"]) }))
    expect(screen.queryByText("a.txt")).toBeNull()
    expect(screen.getByText("Фото установки")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${S["labFiles.filter.all"]}`) }))
    expect(screen.getByText("a.txt")).toBeTruthy()
  })

  it("поиск по названию записи; ничего не нашлось — об этом сказано", async () => {
    setup({ items: [F(), IMG] })
    await screen.findByText("a.txt")
    const input = screen.getByPlaceholderText(S["labFiles.search.placeholder"])
    fireEvent.change(input, { target: { value: "гипотеза" } })
    expect(screen.queryByText("a.txt")).toBeNull()
    expect(screen.getByText("Фото установки")).toBeTruthy()
    fireEvent.change(input, { target: { value: "нет такого" } })
    expect(screen.getByText(S["labFiles.noMatch"])).toBeTruthy()
  })

  it("«По записям»: файлы одной записи собраны под одной плашкой со счётчиком", async () => {
    setup({ items: [IMG, F(), SECOND] })
    await screen.findByText("a.txt")
    fireEvent.click(screen.getByRole("button", { name: S["labFiles.view.byEntity"] }))
    const groups = screen.getAllByTestId("lab-file-group")
    expect(groups).toHaveLength(2)                                           // гипотеза (2 файла) и наблюдение (1)
    expect(groups[0].textContent).toContain("Гипотеза А")
    expect(groups[0].textContent).toContain(tt("labFiles.group.count", { n: 2 }))
    expect(within(groups[0]).getAllByTestId("lab-file-row")).toHaveLength(2)
    expect(within(groups[0]).queryAllByRole("link", { name: /Гипотеза А/ })).toHaveLength(1)   // плашка записи — в заголовке, не в каждой строке
  })

  it("нет файлов: подсказка, где их прикреплять; ошибка: можно повторить", async () => {
    setup({ items: [] })
    expect(await screen.findByText(S["labFiles.empty"])).toBeTruthy()
  })

  it("ошибка загрузки показывает «Повторить»", async () => {
    const { get } = setup(Object.assign(new Error("500"), { isAxiosError: true, response: { status: 500 } }))
    fireEvent.click(await screen.findByRole("button", { name: S["labFiles.retry"] }))
    await vi.waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  })

  it("сервер обрезал список: показано честное «первые N из M»", async () => {
    setup({ items: [F()], count: 700, truncated: true })
    expect(await screen.findByText(tt("labFiles.truncated", { n: 1, total: 700 }))).toBeTruthy()
  })
})
