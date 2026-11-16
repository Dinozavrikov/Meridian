import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import postcss, { type AtRule, type Container } from "postcss"

// В Tailwind v4 классы-утилиты лежат в слое utilities, а CSS вне слоёв всегда сильнее любого слоя.
// Универсальный сброс отступов вне слоя молча отключает все p-*, m-*, px-*, mt-* во всём приложении
// (так и было: пустое состояние «Нет новых заявок» схлопывалось в линию, а Button не имел отступов).
function inLayer(node: Container | undefined): boolean {
  for (let p = node; p && p.type !== "root"; p = p.parent as Container | undefined) {
    if (p.type === "atrule" && (p as AtRule).name === "layer") return true
  }
  return false
}

describe("globals.css и слои Tailwind", () => {
  const root = postcss.parse(readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf8"))

  it("вне слоя нет универсальных правил, задающих margin/padding", () => {
    const offenders: string[] = []
    root.walkRules(rule => {
      if (inLayer(rule.parent as Container)) return
      if (!/(^|[\s>+~,(])\*/.test(rule.selector)) return
      rule.walkDecls(/^(margin|padding)/, d => { offenders.push(`${rule.selector} { ${d.prop}: ${d.value} }`) })
    })
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("сброс отступов не пропал: он есть, но внутри слоя base", () => {
    let layered = false
    root.walkRules(rule => {
      if (!inLayer(rule.parent as Container)) return
      if (/\*/.test(rule.selector) && rule.some(n => n.type === "decl" && /^padding$/.test(n.prop))) layered = true
    })
    expect(layered).toBe(true)
  })
})
