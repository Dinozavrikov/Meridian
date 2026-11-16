import { describe, it, expect } from "vitest"
import { stickyTop } from "@/lib/use-sticky-top"

describe("stickyTop: куда прилипает боковой паспорт", () => {
  it("низкий паспорт приклеен под шапкой", () => {
    expect(stickyTop(53, 900, 400)).toBe(69)
  })
  it("высокий паспорт уходит вверх так, что его низ у нижнего края окна", () => {
    expect(stickyTop(53, 900, 1535)).toBe(900 - 1535 - 16)
  })
  it("на границе, когда паспорт ровно помещается, верх не меняется", () => {
    expect(stickyTop(53, 900, 815)).toBe(69)
  })
})
