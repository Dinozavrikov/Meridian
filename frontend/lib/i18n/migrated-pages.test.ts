import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"

// Страницы, целиком переведённые на useT / useDynamicTranslate. После миграции новая страница
// добавляется сюда, и русские литералы в ней больше не появятся незаметно: подписи идут через
// t("ключ") (словарь lib/i18n/strings.ts), тексты, которые задаёт система (статусы и т.п.), —
// через useDynamicTranslate.
const MIGRATED = ["app/(app)/stats/page.tsx"]

const CYR = /[А-Яа-яЁё]/

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")
}

describe.each(MIGRATED)("%s", file => {
  const code = codeOnly(readFileSync(file, "utf8"))

  it("не содержит русских литералов вне словаря", () => {
    const offenders = code.split("\n")
      .map((line, i) => ({ n: i + 1, line: line.trim() }))
      .filter(x => CYR.test(x.line))
      .map(x => `${x.n}: ${x.line.slice(0, 90)}`)
    expect(offenders).toEqual([])
  })

  it("все ключи t(...) есть в словаре", () => {
    const keys = [...code.matchAll(/\bt\(\s*"([^"]+)"/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(STRINGS[key], `нет ключа ${key}`).toBeTruthy()
  })
})
