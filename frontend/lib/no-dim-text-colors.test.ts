import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { isDimTextColor } from "@/lib/color"

// Сканирует исходники интерфейса: серый текст вроде #3A3F5C на тёмном фоне нечитаем. Ловит и литерал
// color: "#…", и цвет внутри тернара (color: hov ? "#a" : "#b"), и присваивания el.style.color = "#…"
// в обработчиках наведения (оттуда кнопки «темнели» после первого наведения).
const ROOTS = ["app", "components", "lib"]
const EXPR = /(?<![A-Za-z])color:\s*([^,}\n]+)/g
const ASSIGN = /\.color\s*=\s*(["'])(#[0-9a-fA-F]{3,8})\1/g
const HEXQ = /(["'])(#[0-9a-fA-F]{3,8})\1/g

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* sourceFiles(full)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield full
  }
}

describe("в коде интерфейса нет тусклых цветов текста", () => {
  it("каждый серый цвет текста читается на тёмном фоне с запасом (см. DIM_TEXT_MIN)", () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          const found: string[] = []
          for (const m of line.matchAll(EXPR)) for (const h of m[1].matchAll(HEXQ)) found.push(h[2])
          for (const m of line.matchAll(ASSIGN)) found.push(m[2])
          for (const c of found) if (isDimTextColor(c)) offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${c}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
