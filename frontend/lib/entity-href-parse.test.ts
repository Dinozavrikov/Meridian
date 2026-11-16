import { describe, it, expect } from "vitest"
import { parseEntityHref } from "@/lib/entity-routes"

describe("parseEntityHref", () => {
  it("разбирает тип и id, пробелы по краям терпит", () => {
    expect(parseEntityHref("meridian://hypothesis/12")).toEqual({ type: "hypothesis", id: 12 })
    expect(parseEntityHref("  meridian://task/3 ")).toEqual({ type: "task", id: 3 })
  })
  it.each(["https://example.com/a/1", "meridian://hypothesis/", "meridian://hypothesis/1/2", "meridian://Hypothesis/1", "meridian://hypothesis/x", ""])(
    "чужое и кривое не трогает: %s", href => { expect(parseEntityHref(href)).toBeNull() })
})
