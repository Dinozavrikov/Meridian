import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { FeedList } from "@/components/feed/feed-list"
import { statusColor, typeColor } from "@/lib/theme"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const h = vi.hoisted(() => ({ ensure: vi.fn() }))

// useT возвращает ключ (с переменными): любой литерал в разметке сразу виден.
vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => (vars ? `${key}${JSON.stringify(vars)}` : key),
}))
vi.mock("@/lib/i18n/useTypeRu", () => ({
  useTypeRu: () => ({ hypothesis: "Hyp", prediction: "Pred", task: "Task", observation: "Obs", worldview: "WV", question: "Q" }),
}))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => `dt(${s})` }))
vi.mock("@/lib/i18n/collect-strings", () => ({ collectStrings: (a: string[]) => a }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({
    ct: (t: string, id: number, f: string, text: string) => `ct:${t}:${id}:${f}:${text}`,
    ensure: h.ensure,
  }),
}))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel({ user: { username: "me" }, locale: "en-US" }) }))
vi.mock("@/components/ui/avatar", async () => {
  const React = await import("react")
  return {
    Avatar: (p: any) => React.createElement("i", {
      "data-testid": "av", "data-name": p.name, "data-size": String(p.size), "data-url": p.avatarUrl ?? "",
    }),
  }
})

const mk = (id: number, over: Record<string, unknown> = {}, members: FeedGroup["members"] = []): FeedGroup => ({
  key: `${(over.type as string) ?? "hypothesis"}:${id}`,
  core: {
    id, entity_id: id, type: "hypothesis", title: `H${id}`, preview: "", author_username: "other",
    author_display: "Other", created_at: "2026-11-01T10:00:00Z", ...over,
  } as FeedItem,
  members, internal: [], outside: [], activity: "2026-11-02T12:00:00Z", size: 1 + members.length, topics: [],
})
const member = (id: number, relation: string): FeedGroup["members"][number] => ({
  item: { id, entity_id: id, type: "observation", title: `M${id}`, preview: "", author_username: "other",
    author_display: "Other", created_at: "2026-11-01T10:00:00Z" } as FeedItem,
  relation,
})

const mount = (groups: FeedGroup[], isNew: (g: FeedGroup) => boolean = () => false) =>
  render(<FeedList groups={groups} isNew={isNew} />)
const cssVar = (el: Element, name = "--c") => (el as HTMLElement).style.getPropertyValue(name).toLowerCase()
const verdict = (i = 0) => screen.getAllByTestId("feed-list-verdict")[i]

beforeEach(() => { h.ensure.mockReset() })
afterEach(() => cleanup())

describe("FeedList: строки", () => {
  it("строка на карточку в порядке ленты; строка ведёт на дискуссию (у репоста — на источник)", () => {
    mount([mk(1), mk(2, { repost_source_type: "observation", repost_source_id: 9 })])
    const rows = screen.getAllByTestId("feed-list-row")
    expect(rows.map(r => r.getAttribute("href"))).toEqual(["/feed/discussion/hypothesis/1", "/feed/discussion/observation/9"])
  })

  it("пустой список — без строк", () => {
    mount([])
    expect(screen.queryAllByTestId("feed-list-row")).toHaveLength(0)
  })

  it("строка из трёх зон: вердикт слева, основная часть, счётчик комментариев; шапки колонок нет", () => {
    mount([mk(1)])
    const row = screen.getByTestId("feed-list-row")
    expect(row.children).toHaveLength(3)
    expect(row.children[0].getAttribute("data-testid")).toBe("feed-list-verdict")
    expect(row.children[2].getAttribute("data-cnt")).toBe("comments")
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0)
  })

  it("чужой заголовок идёт через контентный перевод, свой — как есть и в перевод не уходит", () => {
    mount([mk(1), mk(2, { author_username: "me", title: "Mine" })])
    const rows = screen.getAllByTestId("feed-list-row")
    expect(rows[0].textContent).toContain("ct:hypothesis:1:title:H1")
    expect(rows[1].textContent).toContain("Mine")
    expect(rows[1].textContent).not.toContain("ct:")
    expect(h.ensure).toHaveBeenCalledTimes(1)
    expect(h.ensure.mock.calls[0][0]).toEqual([{ entityType: "hypothesis", entityId: 1, field: "title", text: "H1" }])
  })

  it("у записи без заголовка утверждением служит текст без разметки (чужой — через перевод превью)", () => {
    mount([
      mk(3, { type: "worldview", title: "", preview: "<p>Body  text</p>" }),
      mk(4, { type: "worldview", title: "", preview: "<p>Own  text</p>", author_username: "me" }),
    ])
    const rows = screen.getAllByTestId("feed-list-row")
    expect(rows[0].textContent).toContain("ct:worldview:3:preview:Body text")
    expect(rows[1].textContent).toContain("Own text")
    expect(h.ensure.mock.calls[0][0]).toEqual([{ entityType: "worldview", entityId: 3, field: "preview", text: "Body text" }])
  })

  it("все свои записи — перевод не запрашивается", () => {
    mount([mk(1, { author_username: "me" })])
    expect(h.ensure).not.toHaveBeenCalled()
  })
})

describe("FeedList: вердикт слева", () => {
  it("гипотеза с подтверждениями и опровержениями: счёт «за : против», полоса пропорциональна, подпись, aria", () => {
    mount([mk(1, {}, [member(10, "подтверждает"), member(11, "подтверждает"), member(12, "опровергает"), member(13, "связано"), member(14, "my-custom-type")])])
    const v = verdict()
    expect(v.getAttribute("data-kind")).toBe("balance")
    expect(v.querySelector("[data-score=confirm]")!.textContent).toBe("2")
    expect(v.querySelector("[data-score=refute]")!.textContent).toBe("1")
    expect(v.querySelector("[data-score=related]")).toBeNull()
    const segs = [...v.querySelectorAll("[data-seg]")] as HTMLElement[]
    expect(segs.map(s => s.getAttribute("data-seg"))).toEqual(["confirm", "refute", "related"])
    expect(segs.map(s => s.style.flexGrow)).toEqual(["2", "1", "2"])
    expect(v.querySelector(".mfl-cap")!.textContent).toBe("feedList.forAgainst")
    expect(v.getAttribute("aria-label")).toBe('feedList.balanceLabel{"c":2,"r":1,"o":2}')
  })

  it("гипотеза только со связями без оценки: число связей, нейтральная полоса, подпись «связи»", () => {
    mount([mk(1, {}, [member(10, "связано"), member(11, "связано"), member(12, "связано")])])
    const v = verdict()
    expect(v.getAttribute("data-kind")).toBe("related")
    expect(v.querySelector("[data-score=related]")!.textContent).toBe("3")
    expect(v.querySelector("[data-score=confirm]")).toBeNull()
    expect(v.querySelector("[data-score=refute]")).toBeNull()
    expect([...v.querySelectorAll("[data-seg]")].map(s => s.getAttribute("data-seg"))).toEqual(["related"])
    expect(v.querySelector(".mfl-cap")!.textContent).toBe("feedList.relatedCaption")
  })

  it("гипотеза без участников: прочерк и подпись, полосы нет", () => {
    mount([mk(1)])
    const v = verdict()
    expect(v.getAttribute("data-kind")).toBe("none")
    expect(v.querySelectorAll("[data-seg]")).toHaveLength(0)
    expect(v.textContent).toContain("feedList.none")
    expect(v.textContent).toContain("feedList.noEvidenceShort")
    expect(v.getAttribute("aria-label")).toBe("feedList.noEvidence")
  })

  it("не гипотеза: вердикт — иконка и статус, а не баланс, даже если связи есть", () => {
    mount([mk(1, { type: "prediction", status: "подтвердился" }, [member(10, "подтверждает"), member(11, "опровергает")])])
    const v = verdict()
    expect(v.getAttribute("data-kind")).toBe("status")
    expect(v.querySelector("[data-score]")).toBeNull()
    expect(v.querySelectorAll("[data-seg]")).toHaveLength(0)
  })

  it("иконка вердикта по типу и статусу", () => {
    const cases: [string, string | undefined, string][] = [
      ["prediction", "подтвердился", "check"], ["prediction", "частично подтвердился", "partial"],
      ["prediction", "не подтвердился", "x"], ["prediction", "не проверен", "clock"], ["prediction", undefined, "clock"],
      ["observation", "осмысленное", "eye"], ["question", "открыт", "help"], ["task", "открыта", "task"], ["worldview", undefined, "worldview"],
    ]
    for (const [type, status, icon] of cases) {
      const { unmount } = mount([mk(1, { type, status })])
      expect(verdict().querySelector("[data-icon]")!.getAttribute("data-icon"), `${type}/${status}`).toBe(icon)
      unmount()
    }
  })

  it("цвет вердикта — цвет статуса; статус не в словаре или его нет — цвет типа", () => {
    mount([
      mk(1, { type: "prediction", status: "активная проверка" }),
      mk(2, { type: "prediction", status: "какой-то новый" }),
      mk(3, { type: "observation" }),
    ])
    expect([0, 1, 2].map(i => cssVar(verdict(i)))).toEqual([
      statusColor["активная проверка"].toLowerCase(), typeColor.prediction.toLowerCase(), typeColor.observation.toLowerCase(),
    ])
  })

  it("подпись статуса идёт через динамический перевод, полный текст в title; без статуса — прочерк", () => {
    mount([mk(1, { type: "observation", status: "осмысленное" }), mk(2, { type: "observation" })])
    const st = screen.getAllByTestId("feed-list-status")
    expect(st[0].textContent).toBe("dt(осмысленное)")
    expect(st[0].getAttribute("title")).toBe("dt(осмысленное)")
    expect(st[1].textContent).toBe("feedList.none")
  })

  it("статус гипотезы стоит в строке метаданных (в вердикте у неё баланс), у остальных только в вердикте: один элемент статуса на строку", () => {
    mount([mk(1, { status: "идея" }), mk(2, { type: "prediction", status: "подтвердился" }), mk(3)])
    const rows = screen.getAllByTestId("feed-list-row")
    const sts = (i: number) => [...rows[i].querySelectorAll("[data-testid=feed-list-status]")]
    expect(sts(0)).toHaveLength(1)
    expect(sts(0)[0].closest("[data-testid=feed-list-verdict]")).toBeNull()
    expect(sts(0)[0].textContent).toBe("dt(идея)")
    expect(sts(1)).toHaveLength(1)
    expect(sts(1)[0].closest("[data-testid=feed-list-verdict]")).not.toBeNull()
    expect(sts(2)).toHaveLength(0)
  })

  it("не-гипотеза со связями: чип с числом связей; без связей и у гипотезы чипа нет", () => {
    mount([
      mk(1, { type: "prediction" }, [member(10, "подтверждает"), member(11, "связано"), member(12, "связано")]),
      mk(2, { type: "prediction" }),
      mk(3, {}, [member(10, "подтверждает")]),
    ])
    const rows = screen.getAllByTestId("feed-list-row")
    const chip = rows[0].querySelector("[data-testid=feed-list-links]")!
    expect(chip.textContent).toBe("3")
    expect(chip.getAttribute("aria-label")).toBe('feedList.linksLabel{"n":3}')
    expect(rows[1].querySelector("[data-testid=feed-list-links]")).toBeNull()
    expect(rows[2].querySelector("[data-testid=feed-list-links]")).toBeNull()
  })
})

describe("FeedList: автор, тип, счётчики", () => {
  it("тип: подпись и цвет типа на строке (неизвестный тип — нейтральный)", () => {
    mount([mk(1), mk(2, { type: "zzz" })])
    const rows = screen.getAllByTestId("feed-list-row")
    expect(screen.getAllByTestId("feed-list-type").map(e => e.textContent)).toEqual(["Hyp", "zzz"])
    expect(cssVar(rows[0])).toBe(typeColor.hypothesis.toLowerCase())
    expect(cssVar(rows[1])).toBe("#8892a6")
  })

  it("автор выделен: аватар 26 px с фото и имя; без display-имени — логин", () => {
    mount([mk(1, { author_avatar_url: "/u/1.png" }), mk(2, { author_display: "", author_username: "bob" })])
    const av = screen.getAllByTestId("av")
    expect(av.map(a => [a.getAttribute("data-name"), a.getAttribute("data-size"), a.getAttribute("data-url")]))
      .toEqual([["Other", "26", "/u/1.png"], ["bob", "26", ""]])
    expect(screen.getAllByTestId("feed-list-author").map(e => e.textContent)).toEqual(["Other", "bob"])
  })

  it("счётчики: комментарии показаны всегда (ноль приглушён); заметки — только у наблюдений и только если есть", () => {
    mount([
      mk(1, { comment_count: 4 }),
      mk(2, { comment_count: 0 }),
      mk(3, { type: "observation", note_count: 2 }),
      mk(4, { type: "hypothesis", note_count: 2 }),
    ])
    const rows = screen.getAllByTestId("feed-list-row")
    const cnt = (i: number, k: string) => rows[i].querySelector(`[data-cnt=${k}]`)
    expect(cnt(0, "comments")!.textContent).toBe("4")
    expect(cnt(0, "comments")!.getAttribute("aria-label")).toBe('feedList.commentsLabel{"n":4}')
    expect(cnt(0, "comments")!.getAttribute("data-zero")).toBeNull()
    expect(cnt(1, "comments")!.textContent).toBe("0")
    expect(cnt(1, "comments")!.getAttribute("data-zero")).toBe("true")
    expect(cnt(2, "comments")!.textContent).toBe("0")
    expect(cnt(2, "notes")!.textContent).toBe("2")
    expect(cnt(2, "notes")!.getAttribute("aria-label")).toBe('feedList.notesLabel{"n":2}')
    expect(cnt(3, "notes")).toBeNull()
    expect(cnt(0, "notes")).toBeNull()
  })

  it("метка «Новое» — только у строк, для которых isNew истинно", () => {
    mount([mk(1), mk(2), mk(3)], g => g.key !== "hypothesis:2")
    const rows = screen.getAllByTestId("feed-list-row")
    expect(rows.map(r => r.querySelector("[data-testid=feed-list-new]") !== null)).toEqual([true, false, true])
  })

  it("время активности — тег time с исходным значением, текст не пустой", () => {
    const { container } = mount([mk(1)])
    const tm = container.querySelector("time")!
    expect(tm.getAttribute("datetime")).toBe("2026-11-02T12:00:00Z")
    expect(tm.textContent).toMatch(/Nov/)
  })

  it("в разметке нет захардкоженного русского текста (всё через ключи)", () => {
    const { container } = mount(
      [
        mk(1, { comment_count: 2 }, [member(10, "подтверждает"), member(11, "опровергает")]),
        mk(2, { type: "observation", note_count: 1 }),
        mk(3, { type: "prediction" }, [member(12, "связано")]),
        mk(4),
      ],
      g => g.key === "hypothesis:1",
    )
    expect(container.textContent).not.toMatch(/[А-Яа-яЁё]/)
  })
})
