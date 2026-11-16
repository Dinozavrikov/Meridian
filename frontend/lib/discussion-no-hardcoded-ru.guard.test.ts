// Охранный тест: в компонентах обсуждения нет русского текста в коде — интерфейсные строки идут через useT (lib/i18n/strings.ts).
// Комментарии русские можно. Латиницу детектор не ловит: английский литерал он не найдёт.
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { cyrillicInCode, walkSources } from "@/lib/test-utils/cyrillic-in-code"

export { cyrillicInCode }

const DIRS = ["components/discussion", "app/(app)/feed/discussion"]
const FILES = ["components/entities/entity-conversation.tsx", "components/ui/notes-timeline.tsx", "lib/discussion-notes.ts"]

describe("детектор русского текста в коде", () => {
  it("находит литерал и текст в разметке, пропускает комментарии", () => {
    expect(cyrillicInCode('const a = "Привет"')).toHaveLength(1)
    expect(cyrillicInCode("<span>Настроение</span>")).toHaveLength(1)
    expect(cyrillicInCode('<img alt="Картинка" />')).toHaveLength(1)
    expect(cyrillicInCode("const a = 1  // комментарий")).toHaveLength(0)
    expect(cyrillicInCode("// целая строка комментария")).toHaveLength(0)
    expect(cyrillicInCode("/* блок\n   на две строки */\nconst a = 1")).toHaveLength(0)
    expect(cyrillicInCode("{/* в разметке */}")).toHaveLength(0)
    expect(cyrillicInCode('const u = "https://x.io" // ссылка')).toHaveLength(0)
  })
  it("номер строки указан верно", () => {
    expect(cyrillicInCode('const a = 1\nconst b = "Да"')[0][0]).toBe(2)
  })
})

describe("обсуждение: русский текст вне комментариев", () => {
  const files = [...DIRS.flatMap(walkSources), ...FILES].map(p => p.replaceAll("\\", "/"))
  it("список файлов не усох (переименование не должно тихо снять охрану)", () => {
    for (const p of [...DIRS, ...FILES]) expect(existsSync(p), p).toBe(true)
    expect(files.length).toBeGreaterThanOrEqual(10)
  })
  it("в коде нет русских литералов и текста разметки, строки идут через useT", () => {
    const bad = files.flatMap(p => cyrillicInCode(readFileSync(p, "utf-8")).map(([n, l]) => `${p}:${n}: ${l.trim().slice(0, 80)}`))
    expect(bad).toEqual([])
  })
})
