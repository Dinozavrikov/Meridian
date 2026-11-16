import { describe, it, expect } from "vitest"
import { applyLabLock, initialVisibilityFields, isLabLocked } from "@/lib/lab-lock"

describe("lab-lock", () => {
  it("isLabLocked: только число считается привязкой", () => {
    expect(isLabLocked(5)).toBe(true)
    expect(isLabLocked(null)).toBe(false)
    expect(isLabLocked(undefined)).toBe(false)
  })
  it("начальные поля: при привязке lab + lab_id, даже если запись была личной", () => {
    expect(initialVisibilityFields({ visibility: "private", lab_id: null }, 5)).toEqual({ visibility: "lab", lab_id: 5 })
  })
  it("начальные поля без привязки берутся из записи, по умолчанию личное без lab_id", () => {
    expect(initialVisibilityFields({ visibility: "public", lab_id: 3 }, null)).toEqual({ visibility: "public", lab_id: 3 })
    expect(initialVisibilityFields(undefined, undefined)).toEqual({ visibility: "private", lab_id: null })
  })
  it("applyLabLock перебивает любое состояние формы и не трогает остальные поля", () => {
    expect(applyLabLock({ a: 1, visibility: "public", lab_id: 9 }, 5)).toEqual({ a: 1, visibility: "lab", lab_id: 5 })
  })
  it("applyLabLock без привязки возвращает данные как есть", () => {
    const d = { a: 1, visibility: "public", lab_id: null }
    expect(applyLabLock(d, null)).toBe(d)
  })
})

describe("visibilityFromLab (зеркало backend visibility_from_lab)", () => {
  it("публичная лаборатория даёт public, закрытая — lab", async () => {
    const { visibilityFromLab } = await import("@/lib/lab-lock")
    expect(visibilityFromLab(true)).toBe("public")
    expect(visibilityFromLab(false)).toBe("lab")
  })
})
