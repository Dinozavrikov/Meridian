import { describe, it, expect } from "vitest"
import { splitPersonalNotes } from "./discussion-notes"

type C = { id: number; author_username: string; stance?: string | null; replies?: C[] }
const c = (id: number, author_username: string, stance: string | null, replies: C[] = []): C => ({ id, author_username, stance, replies })

describe("splitPersonalNotes", () => {
  it("корень владельца без позиции уходит в личное вместе с ответами; обсуждение остаётся", () => {
    const note = c(1, "own", null, [c(2, "own", null)])
    const talk = c(3, "guest", "confirm")
    const { discussion, personal } = splitPersonalNotes([note, talk], "own")
    expect(personal.map(x => x.id)).toEqual([1])
    expect(personal[0].replies?.map(x => x.id)).toEqual([2])
    expect(discussion.map(x => x.id)).toEqual([3])
  })
  it("ответ владельца без позиции ПОД чужим комментарием остаётся в обсуждении", () => {
    const talk = c(3, "guest", "refute", [c(4, "own", null)])
    const { discussion, personal } = splitPersonalNotes([talk], "own")
    expect(personal).toEqual([])
    expect(discussion[0].replies?.map(x => x.id)).toEqual([4])
  })
  it("комментарий владельца с позицией — это обсуждение; чужой без позиции (старые данные) — тоже", () => {
    const { discussion, personal } = splitPersonalNotes([c(5, "own", "confirm"), c(6, "guest", null)], "own")
    expect(personal).toEqual([])
    expect(discussion.map(x => x.id)).toEqual([5, 6])
  })
  it("без известного владельца (гость, не загружено) ничего не прячется", () => {
    const { discussion, personal } = splitPersonalNotes([c(1, "own", null)], undefined)
    expect(personal).toEqual([])
    expect(discussion.map(x => x.id)).toEqual([1])
  })
})
