// Политика конфиденциальности обещает: сторонней аналитики и трекеров нет. Тест держит это обещание:
// в коде, который уезжает в браузер, не должно быть известных счетчиков и рекламных скриптов.
import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["app", "components", "lib", "public"]
const FILES = ["next.config.ts"]
const SKIP = new Set(["node_modules", ".next", "__screenshots__"])
const SOURCE = /\.(tsx?|jsx?|mjs|html|json|txt)$/
const TEST = /\.(test|guard\.test)\.tsx?$/
const TRACKERS = /yandex|metrika|googletagmanager|google-analytics|googleadservices|gtag\(|analytics\.js|doubleclick|connect\.facebook|facebook\.net|hotjar|clarity\.ms|mixpanel|amplitude|segment\.(io|com)|top-fwz1|img\.youtube|ytimg|vimeocdn/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (SKIP.has(name)) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe("сторонних счетчиков, трекеров и загрузок до клика нет", () => {
  const files = [...ROOTS.filter(existsSync).flatMap(walk), ...FILES.filter(existsSync)].filter(p => SOURCE.test(p) && !TEST.test(p))
  it("проверяет реальный набор файлов", () => {
    expect(files.length).toBeGreaterThan(300)
    expect(files).toContain(join("app", "layout.tsx"))
  })
  it("шаблон узнает настоящие счетчики и не цепляет шрифты и вход через Google", () => {
    for (const bad of ["https://mc.yandex.ru/metrika/tag.js", "https://www.googletagmanager.com/gtm.js", "gtag('config')", "static.hotjar.com", "https://www.google-analytics.com/analytics.js", "https://img.youtube.com/vi/x/mqdefault.jpg"])
      expect(TRACKERS.test(bad), bad).toBe(true)
    for (const ok of ['import { Inter } from "next/font/google"', "Войти через Google", "/api/v1/auth/google/login"])
      expect(TRACKERS.test(ok), ok).toBe(false)
  })
  it("в коде нет известных счетчиков", () => {
    expect(files.filter(p => TRACKERS.test(readFileSync(p, "utf-8")))).toEqual([])
  })
})
