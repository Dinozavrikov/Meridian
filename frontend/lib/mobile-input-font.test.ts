import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Охрана по тексту, а не замер: правило про 16px на сенсорных экранах есть, с !important и на верхнем уровне globals.css.
 * Решает !important (иначе инлайновые fontSize на полях его перебивают); верхний уровень файла требуется как соглашение,
 * на результат положение относительно слоев не влияет (проверено в Chromium). Фактический размер полей считает браузерный тест
 * components/ui/input-touch-font.browser.test.tsx (getComputedStyle в режиме касания), jsdom стили не считает.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "")

function topLevelBlocks(src: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = []
  let depth = 0, start = 0, bodyStart = 0, prelude = ""
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "{") {
      if (depth === 0) { prelude = src.slice(start, i).trim(); bodyStart = i + 1 }
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0) { out.push({ prelude, body: src.slice(bodyStart, i) }); start = i + 1 }
    }
  }
  return out
}

describe("поля ввода на сенсорных экранах", () => {
  it("получают 16px с !important на верхнем уровне файла, чтобы iOS не приближал страницу при фокусе", () => {
    const touch = topLevelBlocks(css).filter(b => /hover:\s*none/.test(b.prelude) && /pointer:\s*coarse/.test(b.prelude))
    expect(touch.length).toBeGreaterThan(0)
    expect(touch.map(b => b.body).join("\n")).toMatch(/input[^{}]*\{[^{}]*font-size:\s*16px\s*!important/)
  })
})
