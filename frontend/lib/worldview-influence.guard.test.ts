// Охранный тест: подписи влияния лежат в словаре i18n, а не литералами в lib/worldview-influence.ts.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"

const S = STRINGS as Record<string, string>
type Keyed = { value: string; labelKey?: string; descKey?: string }

describe("подписи влияния на убеждение", () => {
  it("в lib/worldview-influence.ts нет кириллицы вне комментариев", () => {
    const src = readFileSync("lib/worldview-influence.ts", "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    expect(src.match(/[А-Яа-яЁё]+/g) ?? []).toEqual([])
  })
  it("у каждого влияния есть labelKey и descKey, и оба заведены в словаре", () => {
    for (const i of WORLDVIEW_INFLUENCE as unknown as Keyed[]) {
      expect(i.labelKey, i.value).toBeTruthy()
      expect(i.descKey, i.value).toBeTruthy()
      expect(S[i.labelKey!], i.labelKey).toBeTruthy()
      expect(S[i.descKey!], i.descKey).toBeTruthy()
    }
  })
})
