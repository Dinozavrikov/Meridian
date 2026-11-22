// Охранный тест: ARCHITECTURE.md не хранит устаревающие числа, одноязычный и не ссылается на несуществующий код.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { missingReferences, volatileNumbers, corpusPaths, REPO } from "@/lib/test-utils/architecture-doc"

const text = readFileSync(resolve(REPO, "ARCHITECTURE.md"), "utf-8")

describe("ARCHITECTURE.md", () => {
  it("написан на одном языке: кириллицы (в том числе буквы е с двумя точками) нет", () => {
    const bad = text.split("\n").map((l, i) => [i + 1, l] as const).filter(([, l]) => /[\u0400-\u04FF]/.test(l))
    expect(bad.map(([n, l]) => `${n}: ${l.slice(0, 60)}`)).toEqual([])
  })
  it("не хранит числа, которые устаревают с первым коммитом", () => {
    expect(volatileNumbers(text)).toEqual([])
  })
  it("проверка чисел ловит счетчики и версии, но не номера разделов", () => {
    expect(volatileNumbers("### 5.5 Components")).toEqual([])
    expect(volatileNumbers("31 routers, 35 versions, 517 lines")).toHaveLength(3)
    expect(volatileNumbers("pre-1.0 (0.22.3)")).toEqual(["0.22.3"])
    expect(volatileNumbers("the API says 1.0.0")).toEqual([])
  })
  it("все идентификаторы и файлы, на которые он ссылается, есть в репозитории", () => {
    expect(missingReferences(text)).toEqual([])
  })
  it("сам документ не входит в источники своих ссылок", () => {
    expect(corpusPaths()).not.toContain("ARCHITECTURE.md")
    expect(corpusPaths()).toContain("backend/app/main.py")
  })
  it("проверка ссылок ловит несуществующее", () => {
    const fake = ["NO", "SUCH", "THING", "ZZ"].join("_")
    expect(missingReferences(`\`${fake}\` и \`core/${fake.toLowerCase()}.py\``).length).toBe(2)
  })
})
