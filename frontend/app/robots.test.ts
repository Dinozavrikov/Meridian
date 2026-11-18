// Правила robots.txt по настоящему алгоритму (самое длинное совпадение, при равенстве побеждает Allow):
// краулер читает публичные чтения ленты и больше ничего из /api/.
import { describe, expect, it } from "vitest"
import robots from "@/app/robots"

const list = (x?: string | string[]) => (x === undefined ? [] : Array.isArray(x) ? x : [x])

function allowed(path: string): boolean {
  const raw = robots().rules
  let best = { len: -1, allow: true }
  for (const r of Array.isArray(raw) ? raw : [raw]) {
    if (!list(r.userAgent).includes("*")) continue
    for (const [paths, allow] of [[list(r.allow), true], [list(r.disallow), false]] as const) {
      for (const p of paths) {
        if (!p || !path.startsWith(p)) continue
        if (p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow }
      }
    }
  }
  return best.allow
}

describe("robots.txt: публичные чтения ленты", () => {
  it.each([
    "/api/v1/feed/groups/public?page=1&page_size=20",
    "/api/v1/feed/groups/entity/hypothesis/5",
    "/api/v1/feed/public/recently-confirmed",
    "/api/v1/feed/public/graph-teaser",
  ])("разрешено: %s", p => expect(allowed(p)).toBe(true))

  it.each([
    "/api/v1/auth/me",
    "/api/v1/feed/groups/lab/3",
    "/api/v1/feed/hypothesis/5/posts",
    "/api/v1/feed/repost",
    "/api/v1/labs/public",
    "/api/health",
  ])("закрыто: %s", p => expect(allowed(p)).toBe(false))

  it.each(["/login", "/register", "/onboarding", "/settings", "/messages/anna"])("закрыто: %s", p => expect(allowed(p)).toBe(false))
  it.each(["/feed", "/support", "/docs"])("страница открыта: %s", p => expect(allowed(p)).toBe(true))
})
