import { describe, it, expect } from "vitest"
import { describeEffect } from "@/lib/link-effect"

describe("describeEffect", () => {
  it("слова по размеру вклада: до 0.5 слабо, до 2 заметно, от 2 сильно; знак задаёт сторону", () => {
    const k = (v: number) => describeEffect({ kind: "counted", value: v }, "prediction").labelKey
    expect(k(0.3)).toBe("effect.weak.pos")
    expect(k(-0.3)).toBe("effect.weak.neg")
    expect(k(0.5)).toBe("effect.medium.pos")
    expect(k(1.99)).toBe("effect.medium.pos")
    expect(k(-2)).toBe("effect.strong.neg")
  })
  it("нулевой вклад не называется ни подтверждением, ни опровержением", () => {
    const d = describeEffect({ kind: "counted", value: 0 }, "observation")
    expect(d.labelKey).toBe("effect.zero")
    expect(d.tone).toBe("neutral")
  })
  it("число со знаком и подсказка по типу записи", () => {
    const p = describeEffect({ kind: "counted", value: 1.234 }, "prediction")
    expect(p.number).toBe("+1.23")
    expect(p.tipKey).toBe("effect.tip.prediction")
    expect(describeEffect({ kind: "counted", value: -0.18 }, "observation")).toMatchObject({ number: "-0.18", tipKey: "effect.tip.observation", tone: "neg" })
  })
  it("pending, unknown и not_counted без числа", () => {
    for (const kind of ["pending", "unknown", "not_counted"] as const) {
      const d = describeEffect({ kind, value: kind === "pending" ? 0 : null }, "prediction")
      expect(d.number).toBeNull()
      expect(d.tone).toBe("neutral")
    }
    expect(describeEffect({ kind: "pending", value: 0 }, "prediction").labelKey).toBe("effect.pending")
    expect(describeEffect({ kind: "unknown", value: null }, "prediction").labelKey).toBe("effect.unknown")
    expect(describeEffect({ kind: "not_counted", value: null }, "observation").labelKey).toBe("effect.notCounted")
  })
})
