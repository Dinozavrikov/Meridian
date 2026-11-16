import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"

const FILES = [
  "components/entities/attachments-section.tsx",
  "components/entities/files-tab.tsx",
  "lib/attachments.ts",
]
const used = new Set(
  FILES.flatMap(f => [...readFileSync(f, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)].map(m => m[1])),
)

describe("переводы вкладки «Файлы»", () => {
  it("каждый ключ t(...) из новых файлов есть в словаре", () => {
    expect(used.size).toBeGreaterThan(10)
    for (const key of used) expect(STRINGS[key], `нет ключа ${key}`).toBeTruthy()
  })

  it("в словаре нет осиротевших ключей attachmentsTab.* / filesTab.*", () => {
    const own = Object.keys(STRINGS).filter(k => k.startsWith("attachmentsTab.") || k.startsWith("filesTab."))
    expect(own.length).toBeGreaterThan(10)
    for (const key of own) expect(used.has(key), `ключ ${key} нигде не используется`).toBe(true)
  })

  it("ключ подписи вкладки задан", () => {
    expect(STRINGS["tabs.files"]).toBeTruthy()
  })
})
