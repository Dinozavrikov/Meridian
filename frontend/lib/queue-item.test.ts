import { describe, it, expect } from "vitest"
import { toQueueItem } from "@/lib/queue-item"

describe("toQueueItem", () => {
  it("запись дашборда (check_date) и запись списка прогнозов (expected_check_date) дают один вид", () => {
    const dash = toQueueItem({ id: 1, title: "п", text: "т", check_date: "2026-11-01", hyp_name: "Г", hypothesis_id: 3, confidence: 40, confirms_hypothesis_if_true: false })
    const list = toQueueItem({ id: 1, title: "п", text: "т", status: "не проверен", expected_check_date: "2026-11-01", hyp_name: "Г", hypothesis_id: 3, confidence: 40, confirms_hypothesis_if_true: false })
    expect(dash).toEqual(list)
    expect(dash).toMatchObject({ status: "не проверен", expected_check_date: "2026-11-01", confidence: 40, confirms_hypothesis_if_true: false, hypothesis_id: 3 })
  })
  it("уверенность null сохраняется как null (это «не указана»), а отсутствие поля остаётся undefined", () => {
    expect(toQueueItem({ id: 1, confidence: null }).confidence).toBeNull()
    expect(toQueueItem({ id: 1 }).confidence).toBeUndefined()
    expect(toQueueItem({ id: 1 }).confirms_hypothesis_if_true).toBeUndefined()
  })
})
