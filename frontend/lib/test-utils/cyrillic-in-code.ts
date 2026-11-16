// Общие помощники охранных тестов «русского текста в коде нет, строки идут через useT».
// Используют discussion-no-hardcoded-ru.guard.test.ts и features-no-hardcoded-ru.guard.test.ts.
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const CYR = /[А-Яа-яЁё]/

/** Строки кода, где русский текст стоит вне комментария: [номер строки, строка]. */
export function cyrillicInCode(src: string): [number, string][] {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))   // длину строк и номера сохраняем
  return noBlocks.split("\n")
    .map((l, i): [number, string] => [i + 1, l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")])
    .filter(([, l]) => CYR.test(l))
}

/** Все .ts/.tsx без тестов в каталоге, рекурсивно. */
export function walkSources(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === "node_modules" || n.startsWith(".")) return []
    return statSync(p).isDirectory() ? walkSources(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}
