import { describe, it, expect, vi } from "vitest"
import { runPostCreateSteps } from "@/lib/partial-create"

describe("runPostCreateSteps", () => {
  it("без шагов и без провалов возвращает пустой список", async () => {
    expect(await runPostCreateSteps([])).toEqual([])
    expect(await runPostCreateSteps([["links", async () => {}]])).toEqual([])
  })
  it("провал одного шага не мешает остальным и не бросает; провалившиеся названы по порядку", async () => {
    const after = vi.fn()
    const failed = await runPostCreateSteps([
      ["links", async () => { throw new Error("x") }],
      ["images", async () => { after() }],
      ["inline", async () => { throw new Error("y") }],
    ])
    expect(failed).toEqual(["links", "inline"])
    expect(after).toHaveBeenCalledTimes(1)
  })
})
