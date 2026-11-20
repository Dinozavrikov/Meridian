import { describe, expect, it, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useStore } from "@/lib/store"
import { useDynamicT } from "./useDynamicT"

const STATUS = "отклон\u0451н"
const USER_TEXT = "Мо\u0451 название"

describe("dt и буква йо", () => {
  beforeEach(() => useStore.setState({ locale: "ru", dynamicTranslations: {} }))

  it("noYo: на русском статус выходит без йо", () => {
    const { result } = renderHook(() => useDynamicT({ noYo: true }))
    expect(result.current.dt(STATUS)).toBe("отклонен")
  })

  it("noYo: на другом языке перевод берется по старому ключу, без перевода текст без йо", () => {
    useStore.setState({ locale: "en", dynamicTranslations: { [STATUS]: "rejected" } })
    const { result } = renderHook(() => useDynamicT({ noYo: true }))
    expect(result.current.dt(STATUS)).toBe("rejected")
    expect(result.current.dt("отлож\u0451н")).toBe("отложен")
  })

  it("без флага пользовательский текст не меняется ни на русском, ни на другом языке", () => {
    const { result } = renderHook(() => useDynamicT())
    expect(result.current.dt(USER_TEXT)).toBe(USER_TEXT)
    useStore.setState({ locale: "en", dynamicTranslations: {} })
    const r2 = renderHook(() => useDynamicT())
    expect(r2.result.current.dt(USER_TEXT)).toBe(USER_TEXT)
  })
})
