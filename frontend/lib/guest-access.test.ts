import { describe, expect, it } from "vitest"
import { GUEST_ALLOWED, PRERENDERED_PATHS, isGuestAllowedPath, isPrerenderedPath } from "@/lib/guest-access"

describe("корень сайта в списках гостя", () => {
  it("главная открыта гостю и отдает текст в серверном HTML", () => {
    expect(GUEST_ALLOWED).toContain("/")
    expect(PRERENDERED_PATHS).toContain("/")
    expect(isGuestAllowedPath("/")).toBe(true)
    expect(isPrerenderedPath("/")).toBe(true)
  })

  it("корень не открывает чужие пути как префикс", () => {
    for (const p of ["/settings", "/dashboard", "/messages", "//evil", "/feedback", "/featuresx"]) {
      expect(isGuestAllowedPath(p), p).toBe(false)
      expect(isPrerenderedPath(p), p).toBe(false)
    }
    expect(isPrerenderedPath(null)).toBe(false)
  })

  it("вложенные пути разрешенных разделов остаются разрешенными", () => {
    expect(isGuestAllowedPath("/feed/discussion/question/7")).toBe(true)
    expect(isPrerenderedPath("/docs/anything")).toBe(true)
  })
})
