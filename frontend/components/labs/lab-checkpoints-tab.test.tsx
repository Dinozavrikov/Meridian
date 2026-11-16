import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { LabCheckpointsTab } from "@/components/labs/lab-checkpoints-tab"
import {
  labCheckpointsApi, type Checkpoint, type CheckpointDiff, type CheckpointView, type StorageStatus, type VerifyResult,
} from "@/lib/lab-checkpoints-api"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "ru" }) }))

const S = STRINGS as Record<string, string>
const httpError = (status: number, detail: unknown) =>
  Object.assign(new Error(`status ${status}`), { isAxiosError: true, response: { status, data: { detail } } })

const cp = (over: Partial<Checkpoint> = {}): Checkpoint => ({
  id: 1, lab_id: 5, title: "Первый", created_at: "2026-10-06T10:00:00Z", created_by: 1, created_by_username: "alexey",
  parent_id: null, is_published: false, published_at: null, item_count: 12, blob_bytes: 2048, schema_version: 1,
  tree_hash: "t".repeat(64), commit_hash: "ab12cd34ef56" + "0".repeat(52), ...over,
})

interface World {
  items: Checkpoint[]; storage: StorageStatus; verify: VerifyResult
  view: CheckpointView | null; diff: CheckpointDiff | null; createError: unknown; created: Checkpoint | null
}

function setup(over: Partial<World> = {}, props: { labIsPublic?: boolean; canPublish?: boolean } = {}) {
  const w: World = {
    items: [], storage: { used_bytes: 100, budget_bytes: 1000, warn: false },
    verify: { ok: true, problems: [], commit_hash: "x" }, view: null, diff: null, createError: null, created: null, ...over,
  }
  // Подменяется только транспорт (axios-инстанс): разбор ответов и ошибок идёт настоящим кодом.
  const get = vi.spyOn(api, "get").mockImplementation((async (url: string) => {
    if (url === "/api/v1/labs/5/checkpoints") return { data: w.items }
    if (url === "/api/v1/labs/5/checkpoints/storage") return { data: w.storage }
    if (url === "/api/v1/labs/5/checkpoints/diff") return { data: w.diff }
    if (/\/checkpoints\/\d+\/verify$/.test(url)) return { data: w.verify }
    if (/\/checkpoints\/\d+$/.test(url)) return { data: w.view }
    throw new Error(`unexpected GET ${url}`)
  }) as never)
  const post = vi.spyOn(api, "post").mockImplementation((async () => {
    if (w.createError) throw w.createError
    const created = w.created as Checkpoint
    w.items = [created, ...w.items]
    return { data: created }
  }) as never)
  const patch = vi.spyOn(api, "patch").mockImplementation((async (_url: string, body: { is_published: boolean }) => {
    w.items = w.items.map(c => ({ ...c, is_published: body.is_published }))
    return { data: w.items[0] }
  }) as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <LabCheckpointsTab labId={5} labIsPublic={props.labIsPublic ?? true} canPublish={props.canPublish ?? true} />
    </QueryClientProvider>,
  )
  return { w, get, post, patch }
}

const button = (key: string) => screen.getByRole("button", { name: S[key] })

describe("вкладка «Снимки»: список и создание", () => {
  it("пустой список: подсказка и форма создания", async () => {
    setup()
    expect(await screen.findByText(S["labCheckpoints.list.empty"])).toBeTruthy()
    expect(button("labCheckpoints.create.button")).toBeTruthy()
  })

  it("создание: подпись уходит без лишних пробелов, список обновляется, поле очищается", async () => {
    const { post } = setup({ created: cp({ id: 2, title: "перед опытом" }) })
    const input = await screen.findByPlaceholderText(S["labCheckpoints.create.placeholder"])
    fireEvent.change(input, { target: { value: "  перед опытом  " } })
    fireEvent.click(button("labCheckpoints.create.button"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints", { title: "перед опытом" }))
    expect(await screen.findByText("перед опытом")).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("пустая подпись уходит как null", async () => {
    const { post } = setup({ created: cp({ id: 2, title: null }) })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.create.button"] }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints", { title: null }))
    expect(await screen.findByText(S["labCheckpoints.untitled"])).toBeTruthy()
  })

  it("409 «лимит места»: понятный текст с цифрами", async () => {
    setup({ createError: httpError(409, { code: "checkpoint_budget_exceeded", used_bytes: 900, needed_bytes: 300, budget_bytes: 1024 ** 3 }) })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.create.button"] }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("900 B")
    expect(alert.textContent).toContain("1 GB")
  })

  it("полоса хранения показывает занятое; близко к лимиту — предупреждение", async () => {
    setup({ storage: { used_bytes: 900 * 1024 ** 2, budget_bytes: 1024 ** 3, warn: true } })
    expect(await screen.findByText(S["labCheckpoints.storage.warn"])).toBeTruthy()
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("88")
  })
})

describe("вкладка «Снимки»: проверка, хеш, публикация", () => {
  it("проверка цела: сообщение и напоминание сохранить хеш снаружи", async () => {
    const { get } = setup({ items: [cp()] })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.verify.button"] }))
    expect(await screen.findByText(S["labCheckpoints.verify.ok"])).toBeTruthy()
    expect(screen.getByText(S["labCheckpoints.verify.anchorNote"])).toBeTruthy()
    expect(get).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints/1/verify", { params: { files: true } })
  })

  it("проверка нашла расхождения: перечисляются понятным языком", async () => {
    setup({ items: [cp()], verify: { ok: false, problems: ["parent", "item:entity:observation:5"], commit_hash: "x" } })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.verify.button"] }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(S["labCheckpoints.verify.problem.parent"])
    expect(alert.textContent).toContain("entity:observation:5")
  })

  it("копирование контрольной суммы кладёт в буфер полный хеш", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const row = cp()
    setup({ items: [row] })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.row.copyHash"] }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(row.commit_hash))
    expect(await screen.findByText(S["labCheckpoints.row.copied"])).toBeTruthy()
  })

  it("буфер недоступен: хеш показывается целиком, чтобы его можно было выделить", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true })
    const row = cp()
    setup({ items: [row] })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.row.copyHash"] }))
    expect(await screen.findByText(row.commit_hash)).toBeTruthy()
  })

  it("публикация идёт через подтверждение и шлёт is_published=true", async () => {
    const { patch } = setup({ items: [cp()] })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.publish.button"] }))
    expect(await screen.findByText(S["labCheckpoints.publish.confirmTitle"])).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()                                  // пока не подтвердили — ничего не отправлено
    const confirms = screen.getAllByRole("button", { name: S["labCheckpoints.publish.confirm"] })
    fireEvent.click(confirms[confirms.length - 1])                        // последняя — в окне подтверждения
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints/1/publish", { is_published: true }))
    expect(await screen.findByText(S["labCheckpoints.row.published"])).toBeTruthy()
  })

  it("снятие с публикации — сразу, без подтверждения", async () => {
    const { patch } = setup({ items: [cp({ is_published: true })] })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.publish.unpublish"] }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints/1/publish", { is_published: false }))
  })

  it("закрытая лаборатория: кнопки публикации нет, объяснение есть", async () => {
    setup({ items: [cp()] }, { labIsPublic: false })
    expect(await screen.findByText(S["labCheckpoints.publish.needsPublicLab"])).toBeTruthy()
    expect(screen.queryByRole("button", { name: S["labCheckpoints.publish.button"] })).toBeNull()
  })

  it("обычный участник публиковать не может: кнопки нет", async () => {
    setup({ items: [cp()] }, { canPublish: false })
    await screen.findByText("Первый")
    expect(screen.queryByRole("button", { name: S["labCheckpoints.publish.button"] })).toBeNull()
  })
})

const VIEW: CheckpointView = {
  checkpoint: cp(), audience: "member", users: { "1": "alexey" },
  lab: {
    data: { name: "Лаба", description: "<p>О лабе</p>" },
    children: { lab_member: [{ object_key: "lab_member:1", data: { user_id: 1, role: "owner" } }] },
  },
  entities: {
    observation: [{
      entity_id: 5, data: { title: "Моё наблюдение", text: "<p>Текст наблюдения</p>" },
      children: {
        attachment: [{ object_key: "attachment:9", data: { filename: "a.txt" }, item_id: 77, blob_sha256: "x", blob_size: 4, file_missing: false }],
        comment: [{ object_key: "comment:3", data: { content: "коммент", author_id: 1 } }],
      },
    }],
  },
  results: [], links: [], entity_hypotheses: [], scale_defs: [], trashed: [{ entity_type: "observation", entity_id: 8 }],
}

describe("вкладка «Снимки»: просмотр", () => {
  it("открывает содержимое: записи, участники с именами, корзина; карточка раскрывается, файл скачивается по item_id", async () => {
    const { get } = setup({ items: [cp()], view: VIEW })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.row.open"] }))
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints/1"))
    expect(await screen.findByText("Моё наблюдение")).toBeTruthy()
    expect(screen.getByText("Лаба")).toBeTruthy()
    expect(screen.getAllByText("alexey").length).toBeGreaterThan(0)       // имя из карты users, а не «аккаунт удалён»
    expect(screen.getByText("Наблюдение #8")).toBeTruthy()                // отметка корзины

    expect(screen.queryByRole("link")).toBeNull()                         // карточка свёрнута
    fireEvent.click(screen.getByText("Моё наблюдение"))
    expect(screen.getByText("Текст наблюдения")).toBeTruthy()             // разметка превращена в текст
    expect(screen.getByText("коммент")).toBeTruthy()
    expect(screen.getByRole("link").getAttribute("href")).toBe(labCheckpointsApi.fileUrl(5, 1, 77))
  })

  it("автор, которого нет в карте имён, показывается как «аккаунт удалён»", async () => {
    setup({ items: [cp()], view: { ...VIEW, users: {} } })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.row.open"] }))
    fireEvent.click(await screen.findByText("Моё наблюдение"))
    expect(screen.getAllByText(S["labCheckpoints.view.deletedUser"]).length).toBeGreaterThan(0)
  })

  it("«К списку» возвращает к списку снимков", async () => {
    setup({ items: [cp()], view: VIEW })
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.row.open"] }))
    fireEvent.click(await screen.findByRole("button", { name: S["labCheckpoints.view.back"] }))
    expect(await screen.findByText("Первый")).toBeTruthy()
  })
})

describe("вкладка «Снимки»: сравнение", () => {
  const older = cp({ id: 1, title: "Первый" })
  const newer = cp({ id: 2, title: "Второй", parent_id: 1 })
  const DIFF: CheckpointDiff = {
    from: older, to: newer, audience: "member", summary: { changed: 1 },
    records: [{
      kind: "entity", entity_type: "observation", entity_id: 5, object_key: "entity:observation:5", status: "changed",
      label: "Моё наблюдение", changed_fields: { title: { old: "Было", new: "Стало" } },
    }],
  }

  it("пока выбрано меньше двух снимков, сравнить нельзя", async () => {
    setup({ items: [newer, older] })
    await screen.findByText("Второй")
    expect((button("labCheckpoints.compare.button") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole("button", { name: S["labCheckpoints.compare.label"] })[0])
    expect((button("labCheckpoints.compare.button") as HTMLButtonElement).disabled).toBe(true)
  })

  it("два снимка: дифф запрашивается от старого к новому, изменения видны как «было → стало»", async () => {
    const { get } = setup({ items: [newer, older], diff: DIFF })    // в списке новые сверху
    await screen.findByText("Второй")
    const toggles = screen.getAllByRole("button", { name: S["labCheckpoints.compare.label"] })
    fireEvent.click(toggles[0])
    fireEvent.click(toggles[1])
    fireEvent.click(button("labCheckpoints.compare.button"))
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/labs/5/checkpoints/diff", { params: { from: 1, to: 2 } }))
    expect(await screen.findByText("Было")).toBeTruthy()
    expect(screen.getByText("Стало")).toBeTruthy()
    expect(screen.getAllByText(S["labCheckpoints.diff.status.changed"]).length).toBeGreaterThan(0)
  })

  it("различий нет — сказано прямо", async () => {
    setup({ items: [newer, older], diff: { ...DIFF, summary: {}, records: [] } })
    await screen.findByText("Второй")
    const toggles = screen.getAllByRole("button", { name: S["labCheckpoints.compare.label"] })
    fireEvent.click(toggles[0])
    fireEvent.click(toggles[1])
    fireEvent.click(button("labCheckpoints.compare.button"))
    expect(await screen.findByText(S["labCheckpoints.diff.empty"])).toBeTruthy()
  })
})
