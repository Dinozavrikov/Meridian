import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Охранный тест: каждая пара (тип, поле), которую фронтенд передаёт в перевод контента через литералы,
 * должна быть в белом списке бэкенда (backend/app/core/translatable_fields.py), иначе сервер ответит 400
 * и перевод молча пропадёт. Вызовы с типом из переменной (досье, связи) сюда не попадают: они держатся
 * на общих полях title/preview.
 */
const FRONT = process.cwd()
const SKIP = new Set(["node_modules", ".next", ".git", "coverage"])

function walk(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

function allowed() {
  const src = readFileSync(join(FRONT, "..", "backend/app/core/translatable_fields.py"), "utf-8")
  const map = new Map<string, Set<string>>()
  for (const row of src.matchAll(/^\s*"(\w+)":\s*\(([^)]*)\),?\s*$/gm)) {
    map.set(row[1], new Set([...row[2].matchAll(/"(\w+)"/g)].map(x => x[1])))
  }
  return map
}

const quoted = (s: string) => [...s.matchAll(/"(\w+)"/g)].map(x => x[1])
const firstFieldList = (s: string) => {
  for (const b of s.matchAll(/\[([^\]]*)\]/g)) { const f = quoted(b[1]); if (f.length) return f }
  return []
}

function usedPairs() {
  const out: { file: string; type: string; field: string }[] = []
  for (const file of walk(FRONT)) {
    const src = readFileSync(file, "utf-8")
    for (const m of src.matchAll(/useTranslatedField\(\s*"(\w+)"\s*,[^,]+,\s*"(\w+)"/g)) out.push({ file, type: m[1], field: m[2] })
    for (const m of src.matchAll(/useListContentTranslation\(\s*"(\w+)"\s*,/g)) {
      for (const f of firstFieldList(src.slice(m.index! + m[0].length, m.index! + m[0].length + 400))) out.push({ file, type: m[1], field: f })
    }
    for (const m of src.matchAll(/useTranslated(?:List|Entity)Query\(/g)) {
      const hit = /"(\w+)",\s*\[((?:\s*"\w+"\s*,?)+)\s*\]/.exec(src.slice(m.index!, m.index! + 700))
      if (hit) for (const f of quoted(hit[2])) out.push({ file, type: hit[1], field: f })
    }
  }
  return out
}

describe("белый список перевода контента", () => {
  it("файл бэкенда читается, а сканер не слеп", () => {
    expect(allowed().size).toBeGreaterThanOrEqual(10)
    expect(usedPairs().length).toBeGreaterThanOrEqual(20)
  })
  it("каждая пара (тип, поле) из вызовов фронтенда разрешена бэкендом", () => {
    const ok = allowed()
    const bad = usedPairs().filter(p => !ok.get(p.type)?.has(p.field)).map(p => `${p.type}.${p.field}  ← ${p.file.replace(FRONT, "")}`)
    expect([...new Set(bad)]).toEqual([])
  })
})
