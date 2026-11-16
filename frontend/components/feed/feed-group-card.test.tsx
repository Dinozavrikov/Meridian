import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { entityHref } from "@/lib/entity-routes"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const h = vi.hoisted(() => ({
  ensure: vi.fn(), confirm: vi.fn(), toast: vi.fn(),
  store: { user: null as null | { username: string }, locale: "ru" },
  dyn: { prefix: "" },
  ct: { prefix: "" },
  apis: {
    obsApi: { delete: vi.fn() }, hypApi: { delete: vi.fn() }, predApi: { delete: vi.fn() },
    wvApi: { delete: vi.fn() }, questionApi: { delete: vi.fn() }, taskApi: { delete: vi.fn() },
    trashApi: { restore: vi.fn() },
  },
}))

vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({
  useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", prediction: "Прогноз", question: "Вопрос", task: "Задача", worldview: "Убеждение" }),
}))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_a: string, _b: number, _c: string, fallback: string) => h.ct.prefix + fallback, ensure: h.ensure }),
}))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => h.dyn.prefix + s }))
vi.mock("@/lib/api", () => h.apis)
vi.mock("@/lib/confirm", () => ({ askConfirmText: h.confirm }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))
vi.mock("@/components/ui/avatar", async () => {
  const React = await import("react")
  return { Avatar: (p: any) => React.createElement("span", { "data-testid": "avatar", "data-size": String(p.size) }) }
})
vi.mock("@/components/entities/entity-quick-add-menu", () => ({ EntityQuickAddMenu: () => null }))
vi.mock("@/components/feed/repost-quote", () => ({ RepostQuote: () => null }))
vi.mock("@/components/feed/maturation-stepper", () => ({ MaturationStepper: () => null }))
vi.mock("@/components/feed/verify-track", () => ({ VerifyTrack: () => null }))
vi.mock("@/components/feed/repost-modal", async () => {
  const React = await import("react")
  return { RepostModal: (p: any) => React.createElement("div", { "data-testid": "repost-modal", "data-source": `${p.sourceType}:${p.sourceId}` }) }
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })          // замораживаем только «сейчас», таймеры react-query не трогаем
  vi.setSystemTime(new Date(2026, 10, 6, 18, 0))
  h.store.user = null; h.store.locale = "ru"; h.dyn.prefix = ""; h.ct.prefix = ""
  for (const f of [h.ensure, h.confirm, h.toast]) f.mockReset()
  for (const api of Object.values(h.apis)) for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockReset()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const S = STRINGS as Record<string, string>
const tt = (key: string, vars: Record<string, string | number> = {}) =>
  Object.entries(vars).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), S[key])
const local = (d: number, hh = 12, mm = 0) => new Date(2026, 10, d, hh, mm).toISOString()

const item = (type: string, id: number, over: Partial<FeedItem> = {}): FeedItem => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: `<p>превью ${id}</p>`, author_username: "other",
  author_display: "Other", created_at: local(6), comment_count: 0, status: null, ...over,
})
type Mem = { item: FeedItem; relation: string }
const mem = (id: number, relation = "связано", over: Partial<FeedItem> = {}, type = "observation"): Mem =>
  ({ item: item(type, id, over), relation })
const group = (members: Mem[] = [], over: Partial<FeedGroup> = {}, core: Partial<FeedItem> = {}): FeedGroup => ({
  key: "hypothesis:1", core: item("hypothesis", 1, core), members, internal: [], outside: [],
  activity: local(6), size: 1 + members.length, topics: [], ...over,
})
const many = (n: number, relation = "связано"): Mem[] => Array.from({ length: n }, (_, i) => mem(10 + i, relation))

function renderCard(g: FeedGroup, props: { isNew?: boolean; onTopic?: (t: string) => void } = {}) {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, "invalidateQueries")
  const view = render(<QueryClientProvider client={qc}><FeedGroupCard group={g} {...props} /></QueryClientProvider>)
  return { ...view, spy }
}
const rows = () => screen.queryAllByTestId("feed-member")
const marks = () => screen.queryAllByTestId("relation-mark")

describe("FeedGroupCard: шапка", () => {
  it("аватар крупный (раньше был 22 px и терялся), имя автора — ссылка на профиль", () => {
    renderCard(group([], {}, { author_display: "Алексей", author_username: "alex" }))
    expect(Number(screen.getByTestId("avatar").getAttribute("data-size"))).toBeGreaterThanOrEqual(36)
    const name = screen.getByTestId("feed-author")
    expect(name.textContent).toBe("Алексей")
    expect(name.getAttribute("href")).toBe("/profile/alex")
  })

  it("без display_name показывается логин", () => {
    renderCard(group([], {}, { author_display: "", author_username: "alex" }))
    expect(screen.getByTestId("feed-author").textContent).toBe("alex")
  })

  it("тип записи, статус и заголовок-ссылка на обсуждение", () => {
    renderCard(group([], {}, { status: "активная проверка" }))
    expect(screen.getByText("Гипотеза")).not.toBeNull()
    expect(screen.getByTestId("feed-status").textContent).toBe("активная проверка")
    expect(screen.getByRole("heading", { level: 3 }).querySelector("a")!.getAttribute("href")).toBe("/feed/discussion/hypothesis/1")
  })

  it("запись без заголовка (убеждение): заголовком служит текст, абзаца под ним нет", () => {
    renderCard(group([], {}, { type: "worldview", title: "", preview: "<p>Я считаю так</p>" }))
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Я считаю так")
    expect(document.querySelector(".mf-lead")).toBeNull()
  })

  it("есть заголовок и текст: текст идёт абзацем без разметки", () => {
    const { container } = renderCard(group([], {}, { preview: "<p>только <b>текст</b></p>" }))
    expect(container.querySelector(".mf-lead")!.textContent).toBe("только текст")
    expect(container.querySelector("b")).toBeNull()
  })

  it("время: сегодня — только время, вчера — с датой, язык интерфейса учитывается", () => {
    const { unmount } = renderCard(group([], {}, { created_at: local(6, 12, 0) }))
    expect(document.querySelector("time")!.textContent).toBe("12:00")
    unmount()
    const second = renderCard(group([], {}, { created_at: local(5, 14, 3) }))
    expect(document.querySelector("time")!.textContent).toMatch(/5 нояб\.?, 14:03/)
    second.unmount()
    h.store.locale = "en"
    renderCard(group([], {}, { created_at: local(5, 14, 3) }))
    expect(document.querySelector("time")!.textContent).toContain("Nov")
  })
})

describe("FeedGroupCard: перевод", () => {
  it("статус записи и свои типы связей идут через динамический перевод, известные — через словарь", () => {
    h.dyn.prefix = "EN:"
    const g = group([mem(10, "подтверждает"), mem(11, "влияет косвенно")], {}, { status: "активная проверка" })
    renderCard(g)
    expect(screen.getByTestId("feed-status").textContent).toBe("EN:активная проверка")
    expect(marks().map(m => m.getAttribute("aria-label"))).toEqual([S["linkType.confirms"], "EN:влияет косвенно"])
  })

  it("чужие записи (ядро и участники) уходят на перевод, свои — нет", () => {
    h.store.user = { username: "me" }
    renderCard(group([mem(10), mem(11, "связано", { author_username: "me" })]))
    const sent = h.ensure.mock.calls.flatMap(c => c[0] as { entityType: string; entityId: number; field: string }[])
    expect(sent.some(x => x.entityType === "hypothesis" && x.entityId === 1 && x.field === "title")).toBe(true)
    expect(sent.some(x => x.entityId === 10 && x.field === "title")).toBe(true)
    expect(sent.some(x => x.entityId === 10 && x.field === "preview")).toBe(true)
    expect(sent.every(x => x.entityId !== 11)).toBe(true)
  })

  it("своё ядро не переводится вовсе", () => {
    h.store.user = { username: "me" }
    renderCard(group([], {}, { author_username: "me" }))
    expect(h.ensure).not.toHaveBeenCalled()
  })
})

describe("FeedGroupCard: доказательства гипотезы", () => {
  it("легенда и полоса считают видимых участников, у полосы столько сегментов, сколько видов связи", () => {
    const { container } = renderCard(group([mem(10, "подтверждает"), mem(11, "подтверждает"), mem(12, "опровергает"), mem(13, "связано")]))
    const legend = screen.getByTestId("feed-legend").textContent!
    expect(legend).toContain(`2 ${S["feedGroups.legendConfirm"]}`)
    expect(legend).toContain(`1 ${S["feedGroups.legendRefute"]}`)
    expect(legend).toContain(`1 ${S["feedGroups.legendRelated"]}`)
    expect(Array.from(container.querySelectorAll(".mf-bal i")).map(i => i.getAttribute("data-count"))).toEqual(["2", "1", "1"])
  })

  it("виды связи, которых нет, в легенде и полосе не рисуются", () => {
    const { container } = renderCard(group([mem(10, "подтверждает")]))
    expect(screen.getByTestId("feed-legend").textContent).not.toContain(S["feedGroups.legendRefute"])
    expect(container.querySelectorAll(".mf-bal i")).toHaveLength(1)
  })

  it("гипотеза без связей честно говорит, что доказательств нет", () => {
    renderCard(group([]))
    expect(screen.getByTestId("feed-no-evidence").textContent).toBe(S["feedGroups.noEvidence"])
  })

  it("у не-гипотезы блок называется «Связанное» и без шкалы доказательств; без связей блока нет совсем", () => {
    const g = group([mem(10, "подтверждает")], {}, { type: "question" })
    const { unmount } = renderCard(g)
    expect(screen.getByText(S["feedGroups.related"])).not.toBeNull()
    expect(screen.queryByTestId("feed-legend")).toBeNull()
    unmount()
    renderCard(group([], {}, { type: "question" }))
    expect(screen.queryByTestId("feed-no-evidence")).toBeNull()
    expect(screen.queryByTestId("feed-member")).toBeNull()
  })
})

describe("FeedGroupCard: участники", () => {
  it("строка ведёт на запись участника, показывает тип связи и тип записи", () => {
    renderCard(group([mem(10, "опровергает")]))
    expect(rows()[0].getAttribute("href")).toBe(entityHref("observation", 10))
    expect(rows()[0].textContent).toContain("observation-10")
    expect(rows()[0].textContent).toContain("Наблюдение")
    expect(marks()[0].getAttribute("data-kind")).toBe("refute")
    expect(marks()[0].getAttribute("aria-label")).toBe(S["linkType.refutes"])
  })

  it("до пяти участников видны все; шесть — четыре и «ещё 2», по клику все, потом «Свернуть»", () => {
    const { unmount } = renderCard(group(many(5)))
    expect(rows()).toHaveLength(5); expect(screen.queryByTestId("feed-more")).toBeNull()
    unmount()
    renderCard(group(many(6)))
    expect(rows()).toHaveLength(4)
    expect(screen.getByTestId("feed-more").textContent).toContain(tt("feedGroups.moreMembers", { n: 2 }))
    fireEvent.click(screen.getByTestId("feed-more"))
    expect(rows()).toHaveLength(6); expect(screen.queryByTestId("feed-more")).toBeNull()
    fireEvent.click(screen.getByTestId("feed-less"))
    expect(rows()).toHaveLength(4)
  })

  it("участник без заголовка — очищенное превью; счётчики заметок и комментариев только если они есть", () => {
    renderCard(group([mem(10, "связано", { title: "", preview: "<p>только <i>превью</i></p>", note_count: 2, comment_count: 3 })]))
    expect(rows()[0].textContent).toContain("только превью")
    expect(rows()[0].querySelector("i")).toBeNull()
    expect(rows()[0].textContent).toContain("2"); expect(rows()[0].textContent).toContain("3")
  })

  it("неизвестный тип записи не ломает адрес (ведёт в корень)", () => {
    renderCard(group([mem(10, "связано", {}, "mystery")]))
    expect(rows()[0].getAttribute("href")).toBe("/")
  })
})

describe("FeedGroupCard: схема связей", () => {
  it("столько узлов, сколько участников, до восьми; больше — семь и «+N»", () => {
    const { unmount } = renderCard(group(many(3)))
    expect(screen.getAllByTestId("graph-node")).toHaveLength(3)
    expect(screen.queryByTestId("graph-overflow")).toBeNull()
    unmount()
    renderCard(group(many(10)))
    expect(screen.getAllByTestId("graph-node")).toHaveLength(7)
    expect(screen.getByTestId("graph-overflow").textContent).toBe("+3")
  })

  it("у схемы есть текстовая подпись для чтения с экрана", () => {
    renderCard(group(many(2)))
    expect(screen.getByTestId("group-graph").getAttribute("aria-label")).toBe(tt("feedGroups.graphLabel", { n: 3 }))
  })
})

describe("FeedGroupCard: ближайшая проверка", () => {
  const pred = (id: number, day: number, over: Partial<FeedItem> = {}) =>
    mem(id, "связано", { status: "не проверен", expected_check_date: local(day, 9), ...over }, "prediction")

  it("будущая: дата и «через N дн.»", () => {
    renderCard(group([pred(20, 20)]))
    const el = screen.getByTestId("feed-next-check")
    expect(el.getAttribute("data-state")).toBe("future")
    expect(el.textContent).toContain(tt("feedGroups.checkIn", { n: 14 }))
  })
  it("просроченная подсвечена состоянием и называет, на сколько", () => {
    renderCard(group([pred(20, 1)]))
    const el = screen.getByTestId("feed-next-check")
    expect(el.getAttribute("data-state")).toBe("overdue")
    expect(el.textContent).toContain(tt("feedGroups.checkOverdue", { n: 5 }))
  })
  it("закрытый прогноз проверкой не считается", () => {
    renderCard(group([pred(20, 20, { status: "подтвердился" })]))
    expect(screen.queryByTestId("feed-next-check")).toBeNull()
  })
})

describe("FeedGroupCard: заметки, связи вне карточки и между участниками", () => {
  const notes = [1, 2, 3].map(i => ({ id: i, title: "", preview: `<p>текст <b>заметки</b> ${i}</p>`,
    author_username: "u", author_display: "Автор", created_at: local(6, 10) }))

  it("у наблюдения: заметки без разметки и «и ещё N»; у других типов заметок нет", () => {
    const { container, unmount } = renderCard(group([], {}, { type: "observation", notes, note_count: 5 }))
    expect(screen.getAllByTestId("feed-note")).toHaveLength(3)
    expect(screen.getByText(/текст заметки 1/)).not.toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(within(screen.getByTestId("feed-group-notes")).getByText(tt("feedGroups.notesMore", { n: 2 }))).not.toBeNull()
    unmount()
    renderCard(group([], {}, { notes, note_count: 3 }))
    expect(screen.queryByTestId("feed-group-notes")).toBeNull()
  })

  it("«Ещё связано с»: три записи ссылками и «+N»", () => {
    const outside = [1, 2, 3, 4].map(i => ({ type: i % 2 ? "observation" : "question", entity_id: 40 + i, title: `out-${i}` }))
    renderCard(group(many(1), { outside }))
    const box = screen.getByTestId("feed-outside")
    expect(box.querySelectorAll("a")).toHaveLength(3)
    expect(box.querySelectorAll("a")[0].getAttribute("href")).toBe(entityHref("observation", 41))
    expect(box.textContent).toContain(tt("feedGroups.alsoLinkedMore", { n: 1 }))
  })

  it("связи между участниками скрыты, пока не нажали; показывают обе стороны и тип", () => {
    const internal = [{ a: { type: "observation", entity_id: 10, title: "левая" }, b: { type: "observation", entity_id: 11, title: "правая" }, kind: "подтверждает" }]
    renderCard(group(many(2), { internal }))
    expect(screen.queryByTestId("feed-internal-link")).toBeNull()
    fireEvent.click(screen.getByTestId("feed-internal-toggle"))
    const line = screen.getByTestId("feed-internal-link")
    expect(line.textContent).toContain("левая"); expect(line.textContent).toContain("правая")
    expect(within(line).getByRole("img").getAttribute("aria-label")).toBe(S["linkType.confirms"])
  })
})

describe("FeedGroupCard: обсуждение и репост", () => {
  it("«Обсуждение» — ссылка на страницу дискуссии со счётчиком; вложенной ленты комментариев в карточке нет", () => {
    renderCard(group([], {}, { comment_count: 4 }))
    const link = screen.getByTestId("feed-discussion")
    expect(link.getAttribute("href")).toBe("/feed/discussion/hypothesis/1")
    expect(link.getAttribute("aria-label")).toBe(tt("feedGroups.discussionAria", { n: 4 }))
    expect(link.textContent).toContain("4")
    fireEvent.click(link)
    expect(screen.queryByTestId("feed-thread")).toBeNull()
  })

  it("у репоста обсуждение ведёт к исходной записи", () => {
    renderCard(group([], {}, { repost_source_type: "observation", repost_source_id: 5 }))
    expect(screen.getByTestId("feed-discussion").getAttribute("href")).toBe("/feed/discussion/observation/5")
  })

  it("гость: репост показывает приглашение зарегистрироваться; вошедший: окно репоста нужной записи", () => {
    const { unmount } = renderCard(group())
    fireEvent.click(screen.getByRole("button", { name: S["feedCard.repost"] }))
    expect(screen.getByTestId("guest-prompt").querySelector("a")!.getAttribute("href")).toBe("/register")
    unmount()
    h.store.user = { username: "me" }
    renderCard(group())
    fireEvent.click(screen.getByRole("button", { name: S["feedCard.repost"] }))
    expect(screen.getByTestId("repost-modal").getAttribute("data-source")).toBe("hypothesis:1")
  })
})

describe("FeedGroupCard: метки", () => {
  it("«Новое» только когда isNew; «обновлено» только если активность заметно позже создания", () => {
    const { rerender } = renderCard(group())
    expect(screen.queryByTestId("feed-new")).toBeNull(); expect(screen.queryByTestId("feed-updated")).toBeNull()
    const qc = new QueryClient()
    rerender(<QueryClientProvider client={qc}><FeedGroupCard group={group([], { activity: local(7, 10) })} isNew /></QueryClientProvider>)
    expect(screen.getByTestId("feed-new").textContent).toBe(S["feedGroups.newBadge"])
    expect(screen.getByTestId("feed-updated").textContent).toContain("обновлено")
  })

  it("клик по теме отдаёт её имя наружу", () => {
    const onTopic = vi.fn()
    renderCard(group([], { topics: ["alpha", "beta"] }), { onTopic })
    fireEvent.click(screen.getAllByTestId("feed-topic")[1])
    expect(onTopic).toHaveBeenCalledWith("beta")
  })

  it("одиночная запись без связей и тем — без лишних блоков", () => {
    renderCard(group([], {}, { type: "question" }))
    for (const id of ["feed-more", "feed-outside", "feed-new", "feed-updated", "feed-topic", "feed-group-notes", "feed-legend", "feed-next-check"]) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
  })
})

describe("FeedGroupCard: правка и удаление", () => {
  const settle = () => new Promise(r => setTimeout(r, 0))
  const own = (core: Partial<FeedItem> = {}) => { h.store.user = { username: "me" }; return group([], {}, { author_username: "me", ...core }) }
  const del = () => screen.getByRole("button", { name: S["commentsPanel.deleteAction"] })
  const feedInvalidations = (spy: { mock: { calls: any[][] } }) =>
    spy.mock.calls.filter(c => JSON.stringify(c[0]) === JSON.stringify({ queryKey: ["feed"] })).length

  it("кнопки правки и удаления только у автора", () => {
    const first = renderCard(group())
    expect(screen.queryByTitle(S["feedCard.editTitle"])).toBeNull(); expect(screen.queryByTitle(S["commentsPanel.deleteAction"])).toBeNull()
    first.unmount()
    renderCard(own())
    expect(screen.getByTitle(S["feedCard.editTitle"]).getAttribute("href")).toBe(entityHref("hypothesis", 1))
    expect(del()).not.toBeNull()
  })

  it("у своей задачи удаление есть (раньше у задач не было API и карточка падала)", () => {
    renderCard(own({ type: "task" }))
    expect(del()).not.toBeNull()
  })

  it("подтверждение через askConfirmText, отказ ничего не удаляет", async () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(true)
    h.confirm.mockResolvedValue(false)
    renderCard(own())
    fireEvent.click(del())
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith(S["feedCard.confirmDelete"], S["feedCard.confirmDeleteLabel"]))
    await settle()
    expect(native).not.toHaveBeenCalled(); expect(h.apis.hypApi.delete).not.toHaveBeenCalled(); expect(h.toast).not.toHaveBeenCalled()
  })

  it("подтвердил: удаляется нужным API, «Вернуть» достаёт запись из корзины и обновляет ленту", async () => {
    h.confirm.mockResolvedValue(true); h.apis.hypApi.delete.mockResolvedValue({})
    const { spy } = renderCard(own())
    fireEvent.click(del())
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect(h.apis.hypApi.delete).toHaveBeenCalledWith(1)
    const req = h.toast.mock.calls[0][0]
    expect(req).toMatchObject({ message: S["feedCard.deleted"], tone: "success" })
    expect(feedInvalidations(spy)).toBe(1)
    h.apis.trashApi.restore.mockResolvedValue({})
    await req.undo.run()
    expect(h.apis.trashApi.restore).toHaveBeenCalledWith("hypothesis", 1)
    expect(feedInvalidations(spy)).toBe(2)
  })

  it("задача удаляется через API задач и возвращается как задача", async () => {
    h.confirm.mockResolvedValue(true); h.apis.taskApi.delete.mockResolvedValue({})
    renderCard(own({ type: "task" }))
    fireEvent.click(del())
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect(h.apis.taskApi.delete).toHaveBeenCalledWith(1)
    h.apis.trashApi.restore.mockResolvedValue({})
    await h.toast.mock.calls[0][0].undo.run()
    expect(h.apis.trashApi.restore).toHaveBeenCalledWith("task", 1)
  })

  it("сервер отказал (цель лаборатории): тост-ошибка с его причиной, без «Вернуть»", async () => {
    h.confirm.mockResolvedValue(true)
    const detail = "Сначала отвяжите цель от лаборатории «Сон»"
    h.apis.taskApi.delete.mockRejectedValue({ response: { data: { detail } } })
    renderCard(own({ type: "task" }))
    fireEvent.click(del())
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect(h.toast.mock.calls[0][0]).toMatchObject({ message: detail, tone: "error" })
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })

  it("сбой без причины от сервера — общий текст ошибки", async () => {
    h.confirm.mockResolvedValue(true); h.apis.hypApi.delete.mockRejectedValue(new Error("network"))
    renderCard(own())
    fireEvent.click(del())
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect(h.toast.mock.calls[0][0]).toMatchObject({ message: S["feedCard.deleteFailed"], tone: "error" })
  })
})

describe("FeedGroupCard: заметки к наблюдению и перевод", () => {
  const note = (id: number, author: string, title = `Т${id}`, preview = `<p>текст ${id}</p>`) =>
    ({ id, title, preview, author_username: author, author_display: author, created_at: local(6) })
  const obsGroup = (coreAuthor: string, notes: ReturnType<typeof note>[]) =>
    group([], { key: "observation:1" }, { type: "observation", author_username: coreAuthor, notes, note_count: notes.length })
  const sentFor = () => h.ensure.mock.calls.flatMap(c => c[0] as { entityType: string; entityId: number; field: string }[])
    .filter(x => x.entityType === "obs_post")

  it("чужая заметка уходит на перевод (заголовок и текст), своя — нет", () => {
    h.store.user = { username: "me" }
    renderCard(obsGroup("other", [note(5, "other"), note(6, "me")]))
    const sent = sentFor()
    expect(sent.filter(x => x.entityId === 5).map(x => x.field).sort()).toEqual(["preview", "title"])
    expect(sent.some(x => x.entityId === 6)).toBe(false)
  })

  it("правило по автору заметки, а не карточки: чужая заметка под моим наблюдением переводится", () => {
    h.store.user = { username: "me" }
    renderCard(obsGroup("me", [note(5, "other"), note(6, "me")]))
    const sent = sentFor()
    expect(sent.some(x => x.entityId === 5)).toBe(true)
    expect(sent.some(x => x.entityId === 6)).toBe(false)
  })

  it("в разметке чужая заметка читается через перевод, своя — сырой", () => {
    h.store.user = { username: "me" }
    h.ct.prefix = "EN:"
    renderCard(obsGroup("other", [note(5, "other"), note(6, "me")]))
    const texts = screen.getAllByTestId("feed-note").map(n => n.querySelector(".mf-note-q")!.textContent)
    expect(texts).toEqual(["EN:Т5. EN:текст 5", "Т6. текст 6"])
  })
})
