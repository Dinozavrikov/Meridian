// Охранный тест: нативный alert() запрещён, уведомления идут через toast (lib/toast.ts).
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ALLOW: Record<string, string> = {}
const NATIVE = /(window\.alert\(|(?<![\w.])alert\()/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === "node_modules" || n.startsWith(".")) return []
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

describe("нативный alert", () => {
  it("не используется вне allowlist", () => {
    const bad = ["app", "components", "lib"].flatMap(walk)
      .map(p => p.replaceAll("\\", "/"))
      .filter(p => !(p in ALLOW) && NATIVE.test(readFileSync(p, "utf-8")))
    expect(bad).toEqual([])
  })
  it("allowlist не содержит файлов без нативного alert (устарел)", () => {
    for (const p of Object.keys(ALLOW)) expect(NATIVE.test(readFileSync(p, "utf-8")), p).toBe(true)
  })
})
