import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { SITE_LINKS } from "@/lib/site/links"
import { STRINGS } from "@/lib/i18n/strings"
import { isGuestAllowedPath, isPrerenderedPath } from "@/lib/guest-access"

const hasPage = (href: string) =>
  ["(app)", "(site)"].some(g => existsSync(join(process.cwd(), "app", g, href.replace(/^\//, ""), "page.tsx")))

describe("ссылки шапки публичного сайта", () => {
  it("есть что проверять", () => expect(SITE_LINKS.length).toBeGreaterThanOrEqual(4))
  it.each(SITE_LINKS.map(l => l.href))("%s: ведет на настоящую страницу", href => expect(hasPage(href), href).toBe(true))
  it.each(SITE_LINKS.map(l => [l.href, l.labelKey]))("%s: у ссылки есть текст", (_href, key) =>
    expect((STRINGS as Record<string, string>)[key as string]?.trim(), String(key)).toBeTruthy())
  it.each(SITE_LINKS.map(l => l.href))("%s: открыта гостю и отдает текст в серверном HTML", href => {
    expect(isGuestAllowedPath(href), href).toBe(true)
    expect(isPrerenderedPath(href), href).toBe(true)
  })
})
