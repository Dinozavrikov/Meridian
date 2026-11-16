import { describe, it, expect } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import {
  CHECKPOINT_VIEW_KEYS, describeChild, entityBody, entityTitle, kindLabel, orderedChildGroups, toPlainText, typeLabel,
  type DescribeEnv,
} from "@/lib/lab-checkpoints-view"
import type { ViewChild } from "@/lib/lab-checkpoints-api"

const S = STRINGS as Record<string, string>
const t = (key: string) => S[key] ?? key
const child = (key: string): ViewChild => ({ object_key: key, data: {} })

describe("toPlainText", () => {
  it("вырезает теги и раскодирует сущности, абзацы разделяет переводом строки", () => {
    expect(toPlainText("<p>a &amp; b</p><p>c</p>")).toBe("a & b\nc")
  })
  it("разметка и обработчики не переживают: остаётся только текст", () => {
    expect(toPlainText("<img src=x onerror=alert(1)>текст")).toBe("текст")
    expect(toPlainText("<script>alert(1)</script>ok")).toBe("alert(1)ok")
  })
  it("закодированные теги остаются текстом, а не становятся тегами", () => {
    expect(toPlainText("&lt;b&gt;жирный&lt;/b&gt;")).toBe("<b>жирный</b>")
  })
  it("не строка -> пусто; limit обрезает с многоточием", () => {
    expect(toPlainText(null)).toBe("")
    expect(toPlainText(5)).toBe("")
    expect(toPlainText("xxxxxxxxxx", 5)).toBe("xxxxx…")
  })
})

describe("entityTitle / entityBody", () => {
  it("название берётся из поля своего типа, при его отсутствии — номер", () => {
    expect(entityTitle("observation", { title: "Т" }, 7)).toBe("Т")
    expect(entityTitle("hypothesis", { name: "Н" }, 7)).toBe("Н")
    expect(entityTitle("worldview", { belief: "Б" }, 7)).toBe("Б")
    expect(entityTitle("observation", { title: "" }, 7)).toBe("#7")
    expect(entityTitle("unknown", { title: "x" }, 9)).toBe("#9")
    expect(entityTitle("observation", { title: "<b>Жирное</b>" }, 7)).toBe("Жирное")
  })
  it("тело — поле своего типа; у убеждения тела нет", () => {
    expect(entityBody("observation", { text: "<p>Т</p>" })).toBe("Т")
    expect(entityBody("hypothesis", { description: "Д" })).toBe("Д")
    expect(entityBody("worldview", { belief: "Б" })).toBe("")
  })
})

describe("orderedChildGroups", () => {
  it("известные виды — в читаемом порядке, пустые отбрасываются, неизвестные в конце по алфавиту", () => {
    const groups = orderedChildGroups({ post: [child("p")], zzz: [child("z")], tag: [child("t")], aaa: [child("a")], comment: [] })
    expect(groups.map(([k]) => k)).toEqual(["tag", "post", "aaa", "zzz"])
    expect(orderedChildGroups(undefined)).toEqual([])
  })
})

describe("describeChild", () => {
  const env: DescribeEnv = { scaleName: id => `шкала:${id}`, stage: v => `стадия:${v}`, role: v => `роль:${v}` }
  it.each([
    ["tag", { name: "тег" }, "тег"],
    ["comment", { content: "<p>текст</p>" }, "текст"],
    ["post", { title: "З", content: "Т" }, "З — Т"],
    ["source", { title: "", url: "https://x" }, "https://x"],
    ["attachment", { filename: "a.txt" }, "a.txt"],
    ["stage", { current_stage: "research" }, "стадия:research"],
    ["scale_value", { scale_id: "importance", value: 7 }, "шкала:importance: 7"],
    ["task_scale", { name: "Ш", current_val: 3 }, "Ш: 3"],
    ["task_scale_hypothesis", { task_scale_id: 4, hypothesis_id: 9 }, "#4 → #9"],
    ["hyp_status_history", { status: "проверяется" }, "проверяется"],
    ["lab_member", { role: "owner" }, "роль:owner"],
    ["неизвестный", { a: 1 }, ""],
  ])("%s", (kind, data, expected) => expect(describeChild(kind, data as Record<string, unknown>, env)).toBe(expected))
})

describe("словарь", () => {
  it("все ключи, построенные из карт видов, типов и статусов, есть в словаре", () => {
    expect(CHECKPOINT_VIEW_KEYS.length).toBeGreaterThan(30)
    for (const k of CHECKPOINT_VIEW_KEYS) expect(S[k], k).toBeTruthy()
  })
  it("typeLabel / kindLabel: известное переводится, неизвестное остаётся как есть", () => {
    expect(typeLabel(t, "observation")).toBe("Наблюдение")
    expect(typeLabel(t, "что-то")).toBe("что-то")
    expect(kindLabel(t, "post_comment")).toBe("Комментарии к постам")
    expect(kindLabel(t, "что-то")).toBe("что-то")
  })
})
