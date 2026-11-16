import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { allowedLinkTypes, EVIDENCE_LINK_TYPES, INFLUENCE_LINK_TYPES, NEUTRAL_LINK_TYPES, isEvidenceLinkType, isNeutralOnly, linkTypesFor, sameTypeBlocked } from "@/lib/link-vocab"
import { influenceOptions } from "@/lib/worldview-influence"

describe("sameTypeBlocked", () => {
  it("«подтверждает/опровергает» для записи того же типа: блок", () => {
    expect(sameTypeBlocked("подтверждает", "hypothesis", "hypothesis")).toBe(true)
    expect(sameTypeBlocked("опровергает", "observation", "observation")).toBe(true)
  })
  it("нейтральная связь с записью того же типа: не блок", () => {
    expect(sameTypeBlocked("связано", "hypothesis", "hypothesis")).toBe(false)
    expect(sameTypeBlocked("related", "hypothesis", "hypothesis")).toBe(false)
  })
  it("запись другого типа: не блок", () => {
    expect(sameTypeBlocked("подтверждает", "observation", "hypothesis")).toBe(false)
  })
  it("тип своей записи неизвестен: не блок", () => {
    expect(sameTypeBlocked("подтверждает", undefined, "hypothesis")).toBe(false)
  })
  it("доказательными считаются ровно два типа", () => {
    expect(["подтверждает", "опровергает", "связано", "related", "strengthens"].filter(isEvidenceLinkType)).toEqual(["подтверждает", "опровергает"])
  })
})

describe("linkTypesFor", () => {
  const types = [{ value: "подтверждает" }, { value: "опровергает" }, { value: "связано" }]
  it("разные типы записей: все типы связи", () => {
    expect(linkTypesFor(types, "observation", "hypothesis", influenceOptions(k => k))).toEqual(types)
  })
  it("один тип записей: только нейтральная связь", () => {
    expect(linkTypesFor(types, "hypothesis", "hypothesis", influenceOptions(k => k))).toEqual([{ value: "связано" }])
  })
  it("чужие наборы (влияние на убеждение) не трогает даже для одного типа", () => {
    const influence = [{ value: "strengthens" }, { value: "contradicts" }]
    expect(linkTypesFor(influence, "worldview", "worldview", influenceOptions(k => k))).toEqual(influence)
  })
})

describe("allowedLinkTypes", () => {
  const sorted = (a: string, b: string) => [...allowedLinkTypes(a, b)].sort()
  it("с убеждением, в любой роли и с самим убеждением: влияние и нейтральная", () => {
    const want = [...INFLUENCE_LINK_TYPES, ...NEUTRAL_LINK_TYPES].sort()
    for (const [a, b] of [["hypothesis", "worldview"], ["worldview", "observation"], ["worldview", "worldview"]]) expect(sorted(a, b)).toEqual(want)
  })
  it("один тип без убеждения: только нейтральная", () => {
    expect(sorted("hypothesis", "hypothesis")).toEqual([...NEUTRAL_LINK_TYPES].sort())
  })
  it("разные типы без убеждения: доказательные и нейтральная", () => {
    expect(sorted("observation", "hypothesis")).toEqual([...EVIDENCE_LINK_TYPES, ...NEUTRAL_LINK_TYPES].sort())
  })
  it("влияние: ровно четыре значения", () => {
    expect(INFLUENCE_LINK_TYPES).toEqual(["strengthens", "challenges", "transforms", "contradicts"])
  })
})

describe("linkTypesFor: пары с убеждением", () => {
  const base = [{ value: "подтверждает" }, { value: "опровергает" }, { value: "связано" }]
  const values = (xs: { value: string }[]) => xs.map(x => x.value)
  it("влияние подставляется перед базой, доказательные уходят (в любой роли убеждения)", () => {
    expect(values(linkTypesFor(base, "hypothesis", "worldview", influenceOptions(k => k)))).toEqual([...INFLUENCE_LINK_TYPES, "связано"])
    expect(values(linkTypesFor(base, "worldview", "observation", influenceOptions(k => k)))).toEqual([...INFLUENCE_LINK_TYPES, "связано"])
  })
  it("убеждение с убеждением: влияние и «Связано»", () => {
    expect(values(linkTypesFor(base, "worldview", "worldview", influenceOptions(k => k)))).toEqual([...INFLUENCE_LINK_TYPES, "связано"])
  })
  it("своё влияние в базе не дублируется и не дополняется", () => {
    const own = [{ value: "strengthens" }, { value: "связано" }]
    expect(values(linkTypesFor(own, "hypothesis", "worldview", influenceOptions(k => k)))).toEqual(["strengthens", "связано"])
  })
  it("без убеждения влияние не появляется", () => {
    expect(values(linkTypesFor(base, "observation", "hypothesis", influenceOptions(k => k)))).toEqual(["подтверждает", "опровергает", "связано"])
  })
})

describe("isNeutralOnly", () => {
  it("только нейтральные: да; пусто, три типа, влияние: нет", () => {
    expect(isNeutralOnly([{ value: "связано" }])).toBe(true)
    expect(isNeutralOnly([])).toBe(false)
    expect(isNeutralOnly([{ value: "подтверждает" }, { value: "связано" }])).toBe(false)
    expect(isNeutralOnly([{ value: "strengthens" }, { value: "связано" }])).toBe(false)
  })
})

describe("словарь фронтенда совпадает с бэкендом (охрана от дрейфа)", () => {
  const src = readFileSync(resolve(__dirname, "../../backend/app/services/link_mutations.py"), "utf8")
  const pySet = (name: string) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*frozenset\\(\\{([^}]*)\\}\\)`))
    expect(m, `${name} не найден в link_mutations.py`).not.toBeNull()
    return [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1]).sort()
  }
  it("доказательные, нейтральные и влияние", () => {
    expect(pySet("EVIDENCE_LINK_TYPES")).toEqual([...EVIDENCE_LINK_TYPES].sort())
    expect(pySet("NEUTRAL_LINK_TYPES")).toEqual([...NEUTRAL_LINK_TYPES].sort())
    expect(pySet("WORLDVIEW_INFLUENCE_TYPES")).toEqual([...INFLUENCE_LINK_TYPES].sort())
  })
})
