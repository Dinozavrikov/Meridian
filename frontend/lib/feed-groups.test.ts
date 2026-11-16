import { describe, it, expect } from "vitest"
import {
  MEMBERS_COLLAPSED, groupIsOnlyMine, hasNewerActivity, isNewSince, mergeGroups, plain, readSeen,
  relationKind, splitMembers, writeSeen, type FeedGroup, type FeedGroupsPage, type FeedItem, type StorageLike,
} from "@/lib/feed-groups"

const item = (type: string, id: number, author = "a"): FeedItem => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: "", author_username: author, author_display: author,
  created_at: "2026-11-01T00:00:00Z",
})
const group = (coreId: number, memberIds: number[] = [], author = "a"): FeedGroup => ({
  key: `hypothesis:${coreId}`, core: item("hypothesis", coreId, author),
  members: memberIds.map(i => ({ item: item("observation", i, author), relation: "связано" })),
  internal: [], outside: [], activity: "2026-11-02T00:00:00Z", size: 1 + memberIds.length, topics: [],
})
const page = (groups: FeedGroup[]): FeedGroupsPage => ({
  groups, page: 1, page_size: 20, total: groups.length, total_pages: 1, type_counts: {}, topics: [],
})
const memStorage = (data: Record<string, string> = {}): StorageLike => ({
  getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v },
})

describe("mergeGroups", () => {
  it("карточка, сместившаяся на соседнюю страницу, показывается один раз (первое вхождение)", () => {
    const merged = mergeGroups([page([group(1), group(2)]), page([group(2, [9]), group(3)])])
    expect(merged.map(g => g.key)).toEqual(["hypothesis:1", "hypothesis:2", "hypothesis:3"])
    expect(merged[1].members).toHaveLength(0)
  })
})

describe("splitMembers", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => i)
  it("до лимита и лимит+1 — показывать всех (кнопка «ещё 1» больше самой строки)", () => {
    expect(splitMembers(list(MEMBERS_COLLAPSED), false).hidden).toBe(0)
    expect(splitMembers(list(MEMBERS_COLLAPSED + 1), false)).toEqual({ shown: list(MEMBERS_COLLAPSED + 1), hidden: 0 })
  })
  it("дальше — первые четыре и счётчик скрытых", () => {
    const r = splitMembers(list(10), false)
    expect(r.shown).toEqual([0, 1, 2, 3]); expect(r.hidden).toBe(6)
  })
  it("развёрнуто — все", () => {
    expect(splitMembers(list(10), true)).toEqual({ shown: list(10), hidden: 0 })
  })
})

describe("relationKind", () => {
  it.each([["подтверждает", "confirm"], ["опровергает", "refute"], ["связано", "neutral"], ["related", "neutral"],
    ["", "neutral"], ["влияет косвенно", "other"]])("%s → %s", (rel, kind) => expect(relationKind(rel)).toBe(kind))
})

describe("новизна", () => {
  it("первый заход (метки нет) — ничего не новое", () => expect(isNewSince("2026-11-02T00:00:00Z", null)).toBe(false))
  it("после прошлого захода — новое; раньше или в тот же миг — нет", () => {
    expect(isNewSince("2026-11-02T00:00:01Z", "2026-11-02T00:00:00Z")).toBe(true)
    expect(isNewSince("2026-11-02T00:00:00Z", "2026-11-02T00:00:00Z")).toBe(false)
    expect(isNewSince("2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z")).toBe(false)
  })
  it("мусор вместо даты не даёт ложной метки", () => {
    expect(isNewSince("не дата", "2026-11-02T00:00:00Z")).toBe(false)
    expect(isNewSince("2026-11-02T00:00:00Z", "мусор")).toBe(false)
  })
  it("карточка целиком из своих записей не считается новой; одна чужая — считается", () => {
    expect(groupIsOnlyMine(group(1, [2, 3], "me"), "me")).toBe(true)
    const mixed = group(1, [2], "me"); mixed.members.push({ item: item("observation", 5, "other"), relation: "связано" })
    expect(groupIsOnlyMine(mixed, "me")).toBe(false)
    expect(groupIsOnlyMine(group(1, [], "me"), null)).toBe(false)
  })
  it("подсмотр: плашка только если верхняя карточка действительно свежее", () => {
    expect(hasNewerActivity("2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z")).toBe(true)
    expect(hasNewerActivity("2026-11-02T00:00:00Z", "2026-11-02T00:00:00Z")).toBe(false)
    expect(hasNewerActivity("2026-11-03T00:00:00Z", "2026-11-02T00:00:00Z")).toBe(false)
    expect(hasNewerActivity(null, "2026-11-02T00:00:00Z")).toBe(true)
    expect(hasNewerActivity("2026-11-02T00:00:00Z", null)).toBe(false)
    expect(hasNewerActivity(null, null)).toBe(false)
  })
})

describe("метка прошлого захода", () => {
  it("записывается и читается по ключу ленты; ленты не мешают друг другу", () => {
    const st = memStorage()
    writeSeen("public", "2026-11-02T00:00:00Z", st); writeSeen("lab-7", "2026-11-03T00:00:00Z", st)
    expect(readSeen("public", st)).toBe("2026-11-02T00:00:00Z")
    expect(readSeen("lab-7", st)).toBe("2026-11-03T00:00:00Z")
    expect(readSeen("lab-8", st)).toBeNull()
  })
  it("хранилище недоступно или бросает — молча без метки, ничего не падает", () => {
    const broken: StorageLike = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("quota") } }
    expect(readSeen("public", broken)).toBeNull()
    expect(() => writeSeen("public", "x", broken)).not.toThrow()
    expect(readSeen("public", null)).toBeNull()
  })
})

describe("plain", () => {
  it("снимает разметку и схлопывает пробелы", () => {
    expect(plain("<p>текст   <b>заметки</b></p>")).toBe("текст заметки")
    expect(plain(null)).toBe("")
  })
})
