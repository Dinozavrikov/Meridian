import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { QueryClient } from "@tanstack/react-query"
import { ENTITY_ROUTES, type EntityType } from "@/lib/entity-routes"
import {
  ENTITY_LIST_QUERY_KEYS, historyQueryKey, scaleValuesQueryKey, invalidateAfterUndo,
} from "@/lib/entity-history-cache"

const TYPES = Object.keys(ENTITY_ROUTES) as EntityType[]

describe("invalidateAfterUndo", () => {
  it.each(TYPES)("%s: помечает устаревшими историю и шкалы записи, список типа, related и dashboard — и ничего лишнего", async type => {
    const qc = new QueryClient()
    const seed: unknown[][] = [
      ...TYPES.flatMap(t => [7, 8].flatMap(id => [[...historyQueryKey(t, id)], [...scaleValuesQueryKey(t, id)]])),
      ...Object.values(ENTITY_LIST_QUERY_KEYS).map(k => [k]),
      ["predictions", "mine"], ["related", "x"], ["dashboard", "y"], ["labs"],
    ]
    for (const key of seed) qc.setQueryData(key, 1)

    await invalidateAfterUndo(qc, type, 7)

    const invalidated = qc.getQueryCache().getAll().filter(q => q.state.isInvalidated).map(q => JSON.stringify(q.queryKey)).sort()
    const expected = [
      [...historyQueryKey(type, 7)], [...scaleValuesQueryKey(type, 7)], [ENTITY_LIST_QUERY_KEYS[type]],
      ["related", "x"], ["dashboard", "y"],
      ...(type === "prediction" ? [["predictions", "mine"]] : []),
    ].map(k => JSON.stringify(k)).sort()
    expect(invalidated).toEqual(expected)
    qc.clear()
  })

  it("неактивный запрос только помечается устаревшим (перезагрузка активных проверяется в entity-history-tab.test.tsx)", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["worldview"], 1)
    await invalidateAfterUndo(qc, "worldview", 1)
    expect(qc.getQueryState(["worldview"])?.isInvalidated).toBe(true)
    qc.clear()
  })
})

describe("ключи списков совпадают с useQuery на страницах", () => {
  it.each(TYPES)("%s", type => {
    const file = path.resolve(process.cwd(), `app/(app)${ENTITY_ROUTES[type]}/page.tsx`)
    const src = readFileSync(file, "utf8")
    expect(src).toMatch(new RegExp(`useQuery\\(\\{\\s*queryKey:\\s*\\["${ENTITY_LIST_QUERY_KEYS[type]}"`))
  })
})
