import { describe, it, expect } from "vitest"
import { buildLocalGraphData } from "@/lib/graph-data"

const DATA = { related: {
  observation: [{ type: "observation", id: 5, title: "Название", date: "2026-09-04", link_type: "связано" }],
  prediction: [{ type: "prediction", id: 6, title: "Прогноз", date: "2027-01-01", link_type: "прогноз" }],
} }

describe("buildLocalGraphData", () => {
  const { nodes } = buildLocalGraphData(DATA, "hypothesis", 1, "Центр")
  it("центр подписан названием сущности", () => {
    expect(nodes[0]).toMatchObject({ label: "Центр", isCenter: true, entityId: 1 })
  })
  it("наблюдение: подпись — название, дата отдельным полем", () => {
    expect(nodes.find(n => n.type === "observation")).toMatchObject({ label: "Название", date: "2026-09-04" })
  })
  it("у прогноза даты нет: в его date лежит дата проверки", () => {
    expect(nodes.find(n => n.type === "prediction")!.date).toBeUndefined()
  })
})
