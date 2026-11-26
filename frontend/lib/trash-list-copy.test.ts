// The home page names the record types that go to the trash: the list must match the soft-delete models.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { STRINGS } from "@/lib/i18n/strings"

const WORDS: Record<string, string> = {
  Hypothesis: "гипотезы", Observation: "наблюдения", Prediction: "прогнозы",
  Worldview: "убеждения", Question: "вопросы", ResearchTask: "задачи",
}

describe("trash list on the home page", () => {
  it("names exactly the soft-delete models", () => {
    const src = readFileSync(join(process.cwd(), "..", "backend", "app/models/entities.py"), "utf-8")
    const models = [...src.matchAll(/^class (\w+)\([^)]*SoftDeleteMixin/gm)].map(m => m[1])
    expect([...models].sort()).toEqual(Object.keys(WORDS).sort())
    const text = (STRINGS as Record<string, string>)["sitePage.home.data.item.history"]
    const list = /удаленные (.+) попадают в корзину/.exec(text)?.[1] ?? ""
    expect(list.split(/, | и /).sort()).toEqual(models.map(m => WORDS[m]).sort())
  })
})
