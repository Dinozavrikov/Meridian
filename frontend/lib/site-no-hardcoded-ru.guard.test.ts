// Охранный тест: в публичном сайте нет русского текста в коде, строки идут через useT (lib/i18n/strings.ts).
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { cyrillicInCode, walkSources } from "@/lib/test-utils/cyrillic-in-code"

const DIRS = ["components/site", "app/(site)", "lib/site"]

describe("публичный сайт: русский текст вне комментариев", () => {
  const files = DIRS.flatMap(walkSources).map(p => p.replaceAll("\\", "/"))
  it("список файлов не усох", () => {
    for (const p of DIRS) expect(existsSync(p), p).toBe(true)
    expect(files.length).toBeGreaterThanOrEqual(6)
  })
  it("в коде нет русских литералов и текста разметки", () => {
    const bad = files.flatMap(p => cyrillicInCode(readFileSync(p, "utf-8")).map(([n, l]) => `${p}:${n}: ${l.trim().slice(0, 80)}`))
    expect(bad).toEqual([])
  })
})
