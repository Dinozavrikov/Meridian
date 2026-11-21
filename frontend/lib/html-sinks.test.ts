import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// Любой dangerouslySetInnerHTML обязан получать уже очищенный HTML. Тест не заменяет проверки
// самого санитайзера (sanitize-html.test.ts), а не даёт добавить новое место показа в обход него.
const ROOT = process.cwd()
// Корневой layout: JSON-LD из статического объекта (JSON.stringify констант), данных пользователей
// там нет — проверено по коду. Если туда когда-нибудь попадёт переменная, исключение надо убрать.
const EXCLUDED = new Set(["app/layout.tsx"])
// safeJsonLd: сериализатор JSON-LD, экранирует < > & (lib/json-ld.ts, проверен json-ld.test.ts)
const SAFE_PREFIXES = ["renderableHtml(", "sanitizeHtml(", "resolveHtmlImages(sanitizeHtml(", "safeJsonLd("]

function sources(): string[] {
  return ["app", "components"].flatMap(dir =>
    (readdirSync(path.join(ROOT, dir), { recursive: true }) as string[])
      .filter(f => f.endsWith(".tsx") && !f.includes(".test."))
      .map(f => path.posix.join(dir, f.split(path.sep).join("/"))))
}

describe("dangerouslySetInnerHTML", () => {
  it("каждое место показа получает очищенный HTML", () => {
    const offenders: string[] = []
    let sinks = 0
    for (const file of sources()) {
      if (EXCLUDED.has(file)) continue
      const src = readFileSync(path.join(ROOT, file), "utf8")
      for (const m of src.matchAll(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+?)\s*\}\}/g)) {
        sinks++
        if (!SAFE_PREFIXES.some(p => m[1].startsWith(p))) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect(sinks).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
