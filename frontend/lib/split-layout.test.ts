import { describe, it, expect, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

vi.mock("@/components/layout/footer", () => ({ Footer: () => null }))
import { SPLIT_BODY_STYLE } from "@/components/layout/page-shell"

// Корень сплит-панели обязан растягиваться через flex. Через height/minHeight: "100%" он схлопывается до высоты
// содержимого: у PageShell высота не задана, проценты не считаются (пустой список прогнозов, одна задача).
// ЭТОТ ТЕСТ СМОТРИТ ИСХОДНИКИ: раскладку в jsdom не посчитать, поэтому вид проверяется глазами при пересборке образа.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name === "page.tsx") out.push(full)
  }
  return out
}

describe("каркас страниц со сплит-панелью", () => {
  it("общий стиль растягивает корень через flex", () => {
    expect(SPLIT_BODY_STYLE).toMatchObject({ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })
  })

  it("ни одна страница с PageContent noPadding не возвращается к height/minHeight: 100%", () => {
    const offenders: string[] = []
    for (const f of walk(path.resolve(process.cwd(), "app"))) {
      const src = readFileSync(f, "utf8")
      if (!src.includes("<PageContent") || !src.includes("noPadding")) continue
      if (/<div style=\{\{ (minHeight|height): "100%", display: "flex", flexDirection: "column" \}\}>/.test(src)) offenders.push(f)
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
