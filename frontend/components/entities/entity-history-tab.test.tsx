import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { EntityHistoryTab, historyTabs } from "@/components/entities/entity-history-tab"
import type { HistoryItem } from "@/lib/entity-history-api"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "ru" }) }))

// Ошибки в форме axios (lib/api.ts пробрасывает err.response.status и err.response.data.detail как есть).
const httpError = (status: number, detail: unknown) =>
  Object.assign(new Error(`status ${status}`), { isAxiosError: true, response: { status, data: { detail } } })

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 1, created_at: "2026-10-03T07:00:00Z", actor_id: 1, changed_fields: { title: { old: "A", new: "B" } },
  undoable: true, blocked_code: null, blocked_fields: [], reverted: false, reverts_event_id: null, ...over,
})
const reverted = (over: Partial<HistoryItem> = {}) =>
  item({ undoable: false, blocked_code: "conflict", blocked_fields: ["title"], reverted: true, ...over })

const CUSTOM_SCALE = { id: 3, entity_type: "observation", name: "Моя шкала", description: "", min_val: 0, max_val: 10,
  step: 1, group_by: "none", color: "#fff", levels: [] }

// Меняет что-то «руками» в приложении: любая успешная мутация (как слайдер шкалы в шапке записи).
function Mutator() {
  const m = useMutation({ mutationFn: async () => 1 })
  return <button onClick={() => m.mutate()}>slider-change</button>
}

function setup(initial: HistoryItem[], opts: { customScales?: unknown[]; labs?: unknown[] } = {}) {
  const state = { history: initial, fail: false }
  const calls: string[] = []
  const listSpy = vi.fn(async () => [])
  const scaleSpy = vi.fn(async () => ({}))
  // Подменяется только транспорт (axios-инстанс): разбор ответов и ошибок идёт настоящим кодом.
  vi.spyOn(api, "get").mockImplementation((async (url: string) => {
    calls.push(url)
    if (url.endsWith("/history")) {
      if (state.fail) throw httpError(500, null)
      return { data: state.history }
    }
    if (url === "/api/v1/scales/defs") return { data: opts.customScales ?? [] }
    if (url === "/api/v1/scales/defs/builtin") return { data: {} }
    if (url === "/api/v1/labs") return { data: opts.labs ?? [] }
    throw new Error(`unexpected GET ${url}`)
  }) as never)
  const post = vi.spyOn(api, "post")
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Активные наблюдатели: список типа и значения шкал — после отката они обязаны перезагрузиться.
  function Observers() {
    useQuery({ queryKey: ["observations"], queryFn: listSpy })
    useQuery({ queryKey: ["scale-values", "observation", 7], queryFn: scaleSpy })
    return null
  }
  const ui = (owner = true) => (
    <QueryClientProvider client={qc}>
      <Observers />
      <Mutator />
      <EntityHistoryTab entityType="observation" entityId={7} isOwner={owner} />
    </QueryClientProvider>
  )
  const historyCalls = () => calls.filter(u => u.endsWith("/history")).length
  return { state, calls, listSpy, scaleSpy, post, ui, historyCalls }
}

const showTechnical = (n: number) => STRINGS["history.technical.show"].replace("{n}", String(n))
const dayAt = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

describe("EntityHistoryTab: отображение", () => {
  it("подписи полей, старое → новое, HTML без разметки, пользовательская шкала, причина блокировки", async () => {
    const s = setup([item({
      id: 3, undoable: false, blocked_code: "field_not_undoable", blocked_fields: ["status"],
      changed_fields: {
        importance: { old: 1, new: 2 },
        text: { old: "<p>старый <b>текст</b></p>", new: "<p>новый</p>" },
        "scale:custom_3": { old: null, new: 7 },
        status: { old: "идея", new: "проверяется" },
      },
    })], { customScales: [CUSTOM_SCALE] })
    const { container } = render(s.ui())

    expect(await screen.findByText("Значимость")).not.toBeNull()           // название встроенной шкалы для наблюдения
    expect(await screen.findByText("Моя шкала")).not.toBeNull()            // пользовательская шкала, как введена
    expect(screen.getByText(STRINGS["history.field.text"])).not.toBeNull()
    expect(screen.getByText("старый текст")).not.toBeNull()
    expect(screen.getByText("новый")).not.toBeNull()
    expect(container.querySelector("b")).toBeNull()                         // разметка в DOM не попала
    expect(screen.getByText("проверяется")).not.toBeNull()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)              // null → прочерк
    expect(screen.getByText(STRINGS["history.blocked.field_not_undoable"].replace("{fields}", STRINGS["history.field.status"]))).not.toBeNull()
    expect(screen.queryByText(STRINGS["history.undo"])).toBeNull()
  })

  it("длинные значения показываются блоками «Было» и «Стало», короткие — парой", async () => {
    const long1 = `первая версия ${"очень длинного описания ".repeat(3)}`.trim()
    const long2 = `вторая версия ${"очень длинного описания ".repeat(3)}`.trim()
    const s = setup([item({ changed_fields: {
      description: { old: `<p>${long1}</p>`, new: `<p>${long2}</p>` },
      title: { old: "A", new: "B" },
    } })])
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.was"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.became"])).not.toBeNull()
    expect(screen.getAllByText(STRINGS["history.was"])).toHaveLength(1)     // у короткого заголовка блоков нет
    expect(screen.getByText(long1)).not.toBeNull()
    expect(screen.getByText(long2)).not.toBeNull()
    expect(screen.getByText("A")).not.toBeNull()
    expect(screen.getByText("B")).not.toBeNull()
  })

  it("правки сгруппированы по дням, у применённой правки — «Действует»", async () => {
    const s = setup([item({ id: 3, created_at: dayAt(0) }), item({ id: 2, created_at: dayAt(1) }), item({ id: 1, created_at: dayAt(40) })])
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.today"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.yesterday"])).not.toBeNull()
    expect(screen.getAllByTestId("history-row")).toHaveLength(3)
    expect(screen.getAllByText(STRINGS["history.chip.current"])).toHaveLength(3)
  })

  it("пояснение сверху и оговорка снизу", async () => {
    const s = setup([item()])
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.intro"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.footnote"], { exact: false })).not.toBeNull()
  })

  it("удалённая шкала подписана, а не показывается сырым id", async () => {
    const s = setup([item({ undoable: false, blocked_code: "scale_missing", blocked_fields: ["scale:custom_9"],
      changed_fields: { "scale:custom_9": { old: 1, new: 2 } } })])
    render(s.ui())
    expect((await screen.findAllByText(STRINGS["history.field.deletedScale"])).length).toBeGreaterThan(0)
    expect(screen.queryByText("scale:custom_9")).toBeNull()
  })

  it("откаты скрыты по умолчанию: правка с «Применить снова», переключатель с числом; по клику откат виден строкой без кнопок", async () => {
    const s = setup([item({ id: 6, reverts_event_id: 5, changed_fields: { title: { old: "B", new: "A" } } }), reverted({ id: 5 })])
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.redo"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.reverted"])).not.toBeNull()
    expect(screen.queryByText(STRINGS["history.undo"])).toBeNull()          // «откатить откат» не предлагается
    expect(screen.queryByText(/уже изменено позже/)).toBeNull()              // откат не выдаётся за конфликт
    expect(screen.queryAllByTestId("history-tech-row")).toHaveLength(0)
    expect(screen.queryByText(STRINGS["history.badge.undo"])).toBeNull()

    fireEvent.click(screen.getByText(showTechnical(1)))
    expect(screen.getAllByTestId("history-tech-row")).toHaveLength(1)
    expect(screen.getByText(STRINGS["history.badge.undo"])).not.toBeNull()
    expect(screen.queryByText(STRINGS["history.undo"])).toBeNull()
    fireEvent.click(screen.getByText(STRINGS["history.technical.hide"]))
    expect(screen.queryAllByTestId("history-tech-row")).toHaveLength(0)
  })

  it("цепочка «откат → возврат»: правка снова откатываема, строки подписаны «Откат»/«Возврат»", async () => {
    const s = setup([
      item({ id: 7, reverts_event_id: 6 }),
      reverted({ id: 6, reverts_event_id: 5 }),
      item({ id: 5, reverted: true }),
    ])
    render(s.ui())
    expect(await screen.findByText(showTechnical(2))).not.toBeNull()
    expect(screen.getAllByText(STRINGS["history.undo"])).toHaveLength(1)
    expect(screen.queryByText(STRINGS["history.redo"])).toBeNull()
    expect(screen.queryByText(STRINGS["history.reverted"])).toBeNull()
    expect(screen.getByText(STRINGS["history.chip.current"])).not.toBeNull()

    fireEvent.click(screen.getByText(showTechnical(2)))
    expect(screen.getByText(STRINGS["history.badge.redo"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.badge.undo"])).not.toBeNull()
  })

  it("откачено, а значение потом правили руками: бейдж без кнопок и без ложного «конфликта»", async () => {
    const s = setup([reverted({ id: 1 })])
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.reverted"])).not.toBeNull()
    expect(screen.queryByText(STRINGS["history.undo"])).toBeNull()
    expect(screen.queryByText(STRINGS["history.redo"])).toBeNull()
    expect(screen.queryByText(/уже изменено позже/)).toBeNull()
  })

  it("пустая история и подсказка про лимит", async () => {
    const empty = setup([])
    const first = render(empty.ui())
    expect(await screen.findByText(STRINGS["history.empty"])).not.toBeNull()
    first.unmount()

    const many = setup(Array.from({ length: 50 }, (_, i) => item({ id: 100 - i })))
    render(many.ui())
    expect(await screen.findByText(STRINGS["history.limitHint"].replace("{n}", "50"), { exact: false })).not.toBeNull()
  })

  it("ошибка загрузки: текст и повтор, после повтора строки появляются", async () => {
    const s = setup([])
    s.state.fail = true
    render(s.ui())
    expect(await screen.findByText(STRINGS["history.loadError"], { exact: false })).not.toBeNull()
    s.state.fail = false
    s.state.history = [item({ id: 8, changed_fields: { title: { old: "AAA", new: "BBB" } } })]
    fireEvent.click(screen.getByText(STRINGS["history.retry"]))
    expect(await screen.findByText("BBB")).not.toBeNull()
  })
})

describe("EntityHistoryTab: доступ и обновление", () => {
  it("не владелец: понятный текст, ни одного запроса истории, откатить нечем", async () => {
    const s = setup([item()])
    render(s.ui(false))
    expect(await screen.findByText(STRINGS["history.ownerOnly"])).not.toBeNull()
    expect(s.historyCalls()).toBe(0)
    expect(screen.queryByText(STRINGS["history.undo"])).toBeNull()
  })

  it("historyTabs: вкладка есть только у владельца", () => {
    const t = (k: string) => STRINGS[k] ?? k
    expect(historyTabs(t, true)).toEqual([{ id: "history", label: STRINGS["tabs.history"] }])
    expect(historyTabs(t, false)).toEqual([])
  })

  it("правка руками (любая успешная мутация, например слайдер шкалы) сразу обновляет открытую историю", async () => {
    const s = setup([item({ id: 1 })])
    render(s.ui())
    await screen.findByText(STRINGS["history.undo"])
    expect(s.historyCalls()).toBe(1)
    expect(screen.getAllByTestId("history-row")).toHaveLength(1)

    s.state.history = [item({ id: 2, changed_fields: { importance: { old: 0, new: 4 } } }), item({ id: 1 })]
    fireEvent.click(screen.getByText("slider-change"))
    await waitFor(() => expect(screen.getAllByTestId("history-row")).toHaveLength(2))
    expect(s.historyCalls()).toBe(2)
    expect(screen.getByText("Значимость")).not.toBeNull()
  })
})

describe("EntityHistoryTab: откат", () => {
  it("откат: запрос уходит, история и связанные данные перезагружаются, «вперёд» появляется на исходной правке", async () => {
    const s = setup([item({ id: 5 })])
    s.post.mockImplementation((async (url: string) => {
      expect(url).toBe("/api/v1/observation/7/undo/5")
      // состояние сервера после отката: откат — новая правка (помечена reverts_event_id), исходная откачена
      s.state.history = [item({ id: 6, reverts_event_id: 5, changed_fields: { title: { old: "B", new: "A" } } }), reverted({ id: 5 })]
      return { data: { reverted_event_id: 5, fields: ["title"] } }
    }) as never)
    render(s.ui())

    fireEvent.click(await screen.findByText(STRINGS["history.undo"]))
    expect(await screen.findByText(STRINGS["history.redo"])).not.toBeNull()
    expect(screen.getByText(STRINGS["history.reverted"])).not.toBeNull()
    expect(screen.getByText(showTechnical(1))).not.toBeNull()               // сам откат скрыт, но доступен
    expect(s.post).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(s.listSpy).toHaveBeenCalledTimes(2))          // список типа (карточка)
    await waitFor(() => expect(s.scaleSpy).toHaveBeenCalledTimes(2))         // значения шкал (слайдеры)
    expect(s.historyCalls()).toBe(2)                                         // собственный откат не дублирует обновление
  })

  it("«Применить снова» откатывает событие-откат, а не исходную правку", async () => {
    const s = setup([item({ id: 6, reverts_event_id: 5, changed_fields: { title: { old: "B", new: "A" } } }), reverted({ id: 5 })])
    s.post.mockResolvedValue({ data: { reverted_event_id: 6, fields: ["title"] } } as never)
    render(s.ui())
    fireEvent.click(await screen.findByText(STRINGS["history.redo"]))
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/api/v1/observation/7/undo/6"))
  })

  it("409 conflict: понятный текст с названием поля, история перечитывается", async () => {
    const s = setup([item({ id: 5 })])
    s.post.mockRejectedValue(httpError(409, { code: "conflict", fields: ["title"] }))
    render(s.ui())
    fireEvent.click(await screen.findByText(STRINGS["history.undo"]))
    const expected = STRINGS["history.blocked.conflict"].replace("{fields}", STRINGS["history.field.title"])
    expect(await screen.findByText(expected)).not.toBeNull()
    await waitFor(() => expect(s.historyCalls()).toBe(2))
  })

  it("409 prediction_closed и field_not_undoable имеют свои тексты", async () => {
    for (const code of ["prediction_closed", "field_not_undoable"]) {
      const s = setup([item({ id: 5 })])
      s.post.mockRejectedValue(httpError(409, { code, fields: ["title"] }))
      const view = render(s.ui())
      fireEvent.click(await screen.findByText(STRINGS["history.undo"]))
      const expected = STRINGS[`history.blocked.${code}`].replace("{fields}", STRINGS["history.field.title"])
      expect(await screen.findByText(expected)).not.toBeNull()
      view.unmount()
    }
  })

  it("404 и обрыв сети показывают свои тексты", async () => {
    const s = setup([item({ id: 5 })])
    s.post.mockRejectedValueOnce(httpError(404, "Не найдено"))
    render(s.ui())
    fireEvent.click(await screen.findByText(STRINGS["history.undo"]))
    expect(await screen.findByText(STRINGS["history.err.notFound"])).not.toBeNull()

    s.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true, request: {} }))
    fireEvent.click(await screen.findByText(STRINGS["history.undo"]))
    expect(await screen.findByText(STRINGS["history.err.network"])).not.toBeNull()
  })

  it("пока откат выполняется, все кнопки заблокированы и второй запрос не уходит", async () => {
    const s = setup([item({ id: 2 }), item({ id: 1 })])
    s.post.mockImplementation((() => new Promise(() => {})) as never)
    render(s.ui())
    fireEvent.click((await screen.findAllByText(STRINGS["history.undo"]))[0])

    await screen.findByText(STRINGS["history.undoing"])
    expect((screen.getByText(STRINGS["history.undoing"]) as HTMLButtonElement).disabled).toBe(true)
    const other = screen.getByText(STRINGS["history.undo"]) as HTMLButtonElement
    expect(other.disabled).toBe(true)
    fireEvent.click(other)
    expect(s.post).toHaveBeenCalledTimes(1)
  })
})

describe("EntityHistoryTab: даты в значениях", () => {
  it("дата-время со смещением из журнала показывается штампом, а не сырой ISO-строкой", async () => {
    const s = setup([item({ changed_fields: {
      expected_check_date: { old: "2026-11-01T09:00:00+00:00", new: "2026-12-01T09:00:00+00:00" },
    } })])
    render(s.ui())
    await screen.findByText(STRINGS["history.field.expected_check_date"])
    expect(screen.queryByText("2026-11-01T09:00:00+00:00")).toBeNull()
    expect(screen.queryByText("2026-12-01T09:00:00+00:00")).toBeNull()
    // «1 дек · 09:00»: месяц допускает соседний день при любом часовом поясе машины
    expect(screen.getAllByText(/(окт|ноя|дек) · \d{2}:\d{2}/)).toHaveLength(2)
  })
})


describe("EntityHistoryTab: видимость и лаборатория", () => {
  it("lab_id показывается названием лаборатории, а не числом; неизвестная лаборатория — запасной подписью", async () => {
    const s = setup([
      item({ id: 2, changed_fields: { visibility: { old: "lab", new: "private" }, lab_id: { old: 7, new: null } } }),
      item({ id: 1, changed_fields: { lab_id: { old: 9, new: null } } }),
    ], { labs: [{ id: 7, name: "Лаборатория сна" }] })
    render(s.ui())
    expect(await screen.findByText("Лаборатория сна")).not.toBeNull()
    expect(screen.getByText(STRINGS["history.value.labUnknown"].replace("{id}", "9"))).not.toBeNull()
    expect(screen.queryByText("7")).toBeNull()
  })

  it("без смены лаборатории список лабораторий не запрашивается", async () => {
    const s = setup([item()])
    render(s.ui())
    await waitFor(() => expect(s.historyCalls()).toBe(1))
    expect(s.calls).not.toContain("/api/v1/labs")
  })
})
