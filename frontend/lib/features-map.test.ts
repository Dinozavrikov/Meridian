import { afterEach, describe, expect, it, vi } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "@/lib/i18n/strings"
import { NAV_GROUPS, TRASH_ITEM } from "@/lib/nav"
import { ENTITY_ROUTES } from "@/lib/entity-routes"
import {
  EDGES, GROUP_KEYS, MEMBERS, NODES, NODE_BY_KEY, SCOPES, edgePath, featureStats,
  groupLabelKey, groupRail, linkKinds, neighbors, scopeEnd, scopePath,
} from "@/lib/features-map"

const S = STRINGS as Record<string, string>
// Единственный узел без связей: личная переписка не вытекает из записей. Любой другой одинокий узел это ошибка.
const STANDALONE = ["messages"]

describe("состав карты", () => {
  it("каждый узел стоит в колонках ровно один раз", () => {
    const flat = GROUP_KEYS.flatMap(g => [...MEMBERS[g]])
    expect(new Set(flat).size).toBe(flat.length)
    expect(NODES.map(n => n.key).sort()).toEqual([...flat].sort())
  })
  it("у каждого типа записи есть узел в колонке записей", () => {
    for (const type of Object.keys(ENTITY_ROUTES)) expect(MEMBERS.records as readonly string[], type).toContain(type)
  })
  it("каждый раздел меню есть на карте (новый пункт меню без узла роняет тест)", () => {
    const nodeHrefs = new Set(NODES.map(n => n.href))
    const missing = [...NAV_GROUPS.flatMap(g => g.items), TRASH_ITEM].map(i => i.href).filter(h => !nodeHrefs.has(h))
    expect(missing).toEqual([])
  })
  it("маршрут каждого узла существует на диске", () => {
    for (const n of NODES) if (n.href) expect(existsSync(join("app", "(app)", n.href, "page.tsx")), n.href).toBe(true)
  })
  it("названия и описания заведены и не пусты", () => {
    for (const n of NODES) {
      expect(S[n.nameKey]?.trim(), n.nameKey).toBeTruthy()
      expect(S[n.textKey]?.trim(), n.textKey).toBeTruthy()
    }
    for (const g of GROUP_KEYS) expect(S[groupLabelKey(g)]?.trim(), g).toBeTruthy()
  })
  it("в новых строках нет буквы ё", () => {
    const bad = Object.entries(S).filter(([k, v]) => /^(featuresPage|page\.features)\./.test(k) && /[ёЁ]/.test(v))
    expect(bad.map(([k]) => k)).toEqual([])
  })
})

describe("связи", () => {
  it("ссылаются на существующие узлы, без петель и дублей", () => {
    const seen = new Set<string>()
    for (const ed of EDGES) {
      expect(NODE_BY_KEY[ed.from], ed.from).toBeDefined()
      expect(NODE_BY_KEY[ed.to], ed.to).toBeDefined()
      expect(ed.from).not.toBe(ed.to)
      const k = [ed.from, ed.to].sort().join("|")
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
  })
  it("сквозное действие не стоит в той колонке, на которую действует", () => {
    for (const s of SCOPES) {
      expect(NODE_BY_KEY[s.from], s.from).toBeDefined()
      expect(NODE_BY_KEY[s.from].group).not.toBe(s.group)
    }
  })
  it("одиноких узлов нет, кроме явно названных", () => {
    expect(NODES.filter(n => neighbors(n.key).length === 0).map(n => n.key)).toEqual(STANDALONE)
  })
  it("соседство симметрично: если A работает с B, то и B с A", () => {
    for (const a of NODES) for (const b of neighbors(a.key)) expect(neighbors(b), `${a.key} -> ${b}`).toContain(a.key)
  })
  it("сквозной узел видит все записи, а запись видит сквозной узел", () => {
    expect(neighbors("history")).toEqual(expect.arrayContaining([...MEMBERS.records]))
    expect(neighbors("observation")).toContain("history")
  })
})

describe("геометрия", () => {
  it("линия идет от узла-источника к узлу-приемнику", () => {
    for (const ed of EDGES) {
      const a = NODE_BY_KEY[ed.from], b = NODE_BY_KEY[ed.to]
      const d = edgePath(a, b)
      expect(d.startsWith(`M${a.x},${a.y} `), d).toBe(true)
      expect(d.endsWith(` ${b.x},${b.y}`), d).toBe(true)
    }
  })
  it("сквозная линия заканчивается на краю рамки колонки, со стороны источника", () => {
    for (const s of SCOPES) {
      const a = NODE_BY_KEY[s.from]
      const end = scopeEnd(a, s.group)
      const r = groupRail(s.group)
      expect([r.x, r.x + r.w]).toContain(end.x)
      expect(scopePath(a, s.group).endsWith(` ${end.x},${end.y}`)).toBe(true)
    }
  })
})

describe("числа в полосе считаются по источникам", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/stage-labels")
    vi.doUnmock("@/lib/visibility-levels")
    vi.resetModules()
  })
  it("словарь связей содержит основу, а число совпадает с его размером", () => {
    expect(linkKinds()).toEqual(expect.arrayContaining(["подтверждает", "опровергает", "связано"]))
    expect(featureStats().linkKinds).toBe(linkKinds().length)
    expect(featureStats().recordTypes).toBe(Object.keys(ENTITY_ROUTES).length)
  })
  it("число стадий следует за списком стадий", async () => {
    vi.resetModules()
    vi.doMock("@/lib/stage-labels", () => ({ STAGE_VALUES: ["a", "b", "c"] }))
    const m = await import("@/lib/features-map")
    expect(m.featureStats().stages).toBe(3)
  })
  it("число уровней видимости следует за списком уровней", async () => {
    vi.resetModules()
    vi.doMock("@/lib/visibility-levels", () => ({ VISIBILITY_LEVELS: [1, 2, 3, 4, 5].map(i => ({ value: `v${i}` })) }))
    const m = await import("@/lib/features-map")
    expect(m.featureStats().visibilityLevels).toBe(5)
  })
})
