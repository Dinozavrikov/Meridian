// Охранный тест: нативный confirm() запрещён, подтверждения идут через askConfirm/askConfirmText (lib/confirm.ts).
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ALLOW: Record<string, string> = {}
const NATIVE = /(window\.confirm\(|(?<![\w.])confirm\()/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === "node_modules" || n.startsWith(".")) return []
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

describe("нативный confirm", () => {
  it("не используется вне lib/confirm.ts и allowlist", () => {
    const bad = ["app", "components", "lib"].flatMap(walk)
      .map(p => p.replaceAll("\\", "/"))
      .filter(p => p !== "lib/confirm.ts" && !(p in ALLOW) && NATIVE.test(readFileSync(p, "utf-8")))
    expect(bad).toEqual([])
  })
  it("allowlist не содержит файлов без нативного confirm (устарел)", () => {
    for (const p of Object.keys(ALLOW)) expect(NATIVE.test(readFileSync(p, "utf-8")), p).toBe(true)
  })
})
