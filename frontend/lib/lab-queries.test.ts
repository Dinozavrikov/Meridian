import { describe, it, expect } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { invalidateLabCard, invalidateLabMembership, labKeys } from "@/lib/lab-queries"

const mk = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
const invalidated = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)!.isInvalidated

function seeded() {
  const qc = mk()
  qc.setQueryData(labKeys.card("my-slug"), { id: 5 })
  qc.setQueryData(labKeys.card("other-slug"), { id: 6 })
  qc.setQueryData(labKeys.members(5), [])
  qc.setQueryData(labKeys.requests(5), [])
  qc.setQueryData([...labKeys.checkpoints(5), "view", 1], {})   // снимки неизменяемы: дёргать их нельзя
  qc.setQueryData(labKeys.members(6), [])
  qc.setQueryData(["results", "lab", 5], [])
  return qc
}

describe("invalidateLabCard", () => {
  it("в URL слаг: сбрасывает только карточку этой лаборатории", async () => {
    const qc = seeded()
    await invalidateLabCard(qc, 5)
    expect(invalidated(qc, labKeys.card("my-slug"))).toBe(true)
    expect(invalidated(qc, labKeys.card("other-slug"))).toBe(false)
    expect(invalidated(qc, labKeys.members(5))).toBe(false)
    expect(invalidated(qc, labKeys.requests(5))).toBe(false)
    expect(invalidated(qc, [...labKeys.checkpoints(5), "view", 1])).toBe(false)
    expect(invalidated(qc, ["results", "lab", 5])).toBe(false)
  })

  it("в URL числовой id: тоже находит карточку", async () => {
    const qc = mk()
    qc.setQueryData(labKeys.card("7"), { id: 7 })
    await invalidateLabCard(qc, 7)
    expect(invalidated(qc, labKeys.card("7"))).toBe(true)
  })

  it("карточки в кэше нет: ничего не падает и ничего лишнего не сбрасывается", async () => {
    const qc = mk()
    qc.setQueryData(labKeys.members(9), [])
    await invalidateLabCard(qc, 9)
    expect(invalidated(qc, labKeys.members(9))).toBe(false)
  })
})

describe("invalidateLabMembership", () => {
  it("сбрасывает участников, заявки и карточку (в URL слаг), но не снимки, не чужую лабораторию и не списки", async () => {
    const qc = seeded()
    await invalidateLabMembership(qc, 5)
    expect(invalidated(qc, labKeys.members(5))).toBe(true)
    expect(invalidated(qc, labKeys.requests(5))).toBe(true)
    expect(invalidated(qc, labKeys.card("my-slug"))).toBe(true)
    expect(invalidated(qc, [...labKeys.checkpoints(5), "view", 1])).toBe(false)
    expect(invalidated(qc, labKeys.members(6))).toBe(false)
    expect(invalidated(qc, labKeys.card("other-slug"))).toBe(false)
    expect(invalidated(qc, ["results", "lab", 5])).toBe(false)
  })
})
