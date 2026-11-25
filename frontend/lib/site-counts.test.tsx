import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

// Числа на главной берутся из единых источников: подмененный источник меняет число и форму слова.
const h = vi.hoisted(() => ({
  records: {} as Record<string, string>,
  stages: [] as string[],
  vis: [] as { value: string; icon: () => null; color: string }[],
}))
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/entity-routes", () => ({ get ENTITY_ROUTES() { return h.records } }))
vi.mock("@/lib/stage-labels", () => ({ get STAGE_VALUES() { return h.stages }, stageLabel: (_t: unknown, s: string) => s }))
vi.mock("@/lib/visibility-levels", () => ({ get VISIBILITY_LEVELS() { return h.vis } }))
vi.mock("@/lib/maturity-model", async () => ({
  ...(await vi.importActual<typeof import("@/lib/maturity-model")>("@/lib/maturity-model")),
  useMaturityModel: () => ({ data: undefined }),
}))

import { HomeRecords } from "@/components/site/home-blocks"

const make = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`)
afterEach(cleanup)

describe("числа на главной берутся из источников", () => {
  it.each([[1, "1 тип записи"], [2, "2 типа записей"], [5, "5 типов записей"], [11, "11 типов записей"], [21, "21 тип записи"]])(
    "типы записей: %i", (n, expected) => {
      h.records = Object.fromEntries(make(n).map(k => [k, "/x"])); h.stages = []; h.vis = []
      render(<HomeRecords />)
      expect(screen.getByText(expected)).toBeTruthy()
    })

  it.each([[1, "1 стадия пути"], [3, "3 стадии пути"], [8, "8 стадий пути"]])("стадии: %i", (n, expected) => {
    h.records = {}; h.stages = make(n); h.vis = []
    render(<HomeRecords />)
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it.each([[1, "1 уровень видимости"], [3, "3 уровня видимости"], [5, "5 уровней видимости"]])("уровни видимости: %i", (n, expected) => {
    h.records = {}; h.stages = []; h.vis = make(n).map(v => ({ value: v, icon: () => null, color: "#4dcfa6" }))
    render(<HomeRecords />)
    expect(screen.getByText(expected)).toBeTruthy()
  })
})
