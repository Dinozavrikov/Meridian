import { describe, it, expect } from "vitest"
import { canSetType, setTypeBlock } from "@/lib/relation-batch"

const row = (type: string, source?: string) => ({ key: `${type}:1`, type, id: 1, title: "x", source })

describe("setTypeBlock", () => {
  it("свой тип не задан: прежнее поведение, блок только у связей из поля прогноза", () => {
    expect(setTypeBlock([row("hypothesis")], "подтверждает")).toBeNull()
    expect(setTypeBlock([row("prediction", "field")], "связано")).toBe("field")
  })
  it("строка убеждения: влияние и «связано» можно, доказательные нельзя", () => {
    expect(setTypeBlock([row("worldview")], "подтверждает", "hypothesis")).toBe("pair")
    expect(setTypeBlock([row("worldview")], "опровергает", "hypothesis")).toBe("pair")
    expect(setTypeBlock([row("worldview")], "strengthens", "hypothesis")).toBeNull()
    expect(setTypeBlock([row("worldview")], "связано", "hypothesis")).toBeNull()
  })
  it("страница убеждения: строки других типов тоже получают только влияние и «связано»", () => {
    expect(setTypeBlock([row("hypothesis")], "подтверждает", "worldview")).toBe("pair")
    expect(setTypeBlock([row("hypothesis")], "contradicts", "worldview")).toBeNull()
  })
  it("запись без убеждения: влияние нельзя", () => {
    expect(setTypeBlock([row("observation")], "challenges", "hypothesis")).toBe("pair")
    expect(setTypeBlock([row("observation")], "подтверждает", "hypothesis")).toBeNull()
  })
  it("один тип: доказательные нельзя, «связано» можно", () => {
    expect(setTypeBlock([row("hypothesis")], "подтверждает", "hypothesis")).toBe("pair")
    expect(setTypeBlock([row("hypothesis")], "связано", "hypothesis")).toBeNull()
  })
  it("смесь строк: блок, если хоть одной тип не подходит", () => {
    const mix = [row("worldview"), row("observation")]
    expect(setTypeBlock(mix, "strengthens", "hypothesis")).toBe("pair")
    expect(setTypeBlock(mix, "связано", "hypothesis")).toBeNull()
  })
  it("связь из поля прогноза: словарь пары не применяется, решают только «подтверждает/опровергает»", () => {
    expect(setTypeBlock([row("prediction", "field")], "подтверждает", "hypothesis")).toBeNull()
    expect(setTypeBlock([row("prediction", "field")], "strengthens", "hypothesis")).toBe("field")
  })
  it("canSetType: то же в виде булева", () => {
    expect(canSetType([row("worldview")], "подтверждает", "hypothesis")).toBe(false)
    expect(canSetType([row("worldview")], "strengthens", "hypothesis")).toBe(true)
  })
})
