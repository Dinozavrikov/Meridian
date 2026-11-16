import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { typeColor, typeRu } from "@/lib/theme"
import { TYPE_COLORS, TYPE_RU } from "@/lib/utils"

// Источник цветов и названий на фронте — lib/utils.ts (TYPE_COLORS, TYPE_RU); theme.typeColor и theme.typeRu — те же объекты.
// Письма (backend/app/services/email.py) — другой рантайм, общего источника нет: их сверяет тест ниже.
// Расхождение раньше разводило цвет «задачи» по разным местам.
const TYPES = ["hypothesis", "observation", "prediction", "worldview", "question", "task", "lab"]

function emailColors(): Record<string, string> {
  const src = fs.readFileSync(path.resolve(process.cwd(), "../backend/app/services/email.py"), "utf-8")
  // именно присваивание словаря: `ENTITY_COLORS = {...}` или `ENTITY_COLORS: dict[...] = {...}`
  const m = src.match(/ENTITY_COLORS\s*(?::[^=\n]+)?=\s*\{([^}]*)\}/)
  if (!m) throw new Error("словарь ENTITY_COLORS не найден в email.py — тест устарел")
  const out: Record<string, string> = {}
  for (const x of m[1].matchAll(/["'](\w+)["']\s*:\s*["'](#[0-9a-fA-F]{6})["']/g)) out[x[1]] = x[2]
  return out
}

describe("карты цветов типов", () => {
  it("theme.typeColor и utils.TYPE_COLORS — один и тот же объект, а не две копии", () => {
    expect(typeColor).toBe(TYPE_COLORS)
    for (const k of TYPES) expect(typeColor[k], k).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("theme.typeRu и utils.TYPE_RU — один и тот же объект, названия есть для всех типов", () => {
    expect(typeRu).toBe(TYPE_RU)
    for (const k of TYPES) expect(typeRu[k], k).toBeTruthy()
  })

  it("цвета в письмах (email.py) совпадают с интерфейсом", () => {
    const mail = emailColors()
    expect(Object.keys(mail).length).toBeGreaterThan(0)
    for (const k of Object.keys(mail)) expect(mail[k].toLowerCase(), k).toBe(typeColor[k].toLowerCase())
    // и в письмах есть все шесть типов записей (раньше 3 из 6 молча терялись)
    for (const k of ["hypothesis", "observation", "prediction", "worldview", "question", "task"])
      expect(mail[k], k).toBeTruthy()
  })
})
