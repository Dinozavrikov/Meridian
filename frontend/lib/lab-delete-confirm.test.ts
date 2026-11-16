import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { STRINGS } from "@/lib/i18n/strings"
import { labDeleteConfirmText } from "@/lib/lab-delete-confirm"

const t = (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key)

describe("labDeleteConfirmText", () => {
  it("называет лабораторию и предупреждает об удалении снимков, в том числе опубликованных", () => {
    const text = labDeleteConfirmText(t, "Моя лаба")
    expect(text).toContain("«Моя лаба»")
    expect(text).toContain(STRINGS["labsPage.deleteSnapshotsNote"])
    expect(text).toContain("опубликованные")
    expect(text).not.toContain("{name}")
  })

  it("оба текста есть в словаре", () => {
    expect(STRINGS["labsPage.deleteConfirm"]).toBeTruthy()
    expect(STRINGS["labsPage.deleteSnapshotsNote"]).toBeTruthy()
  })

  it("страница списка лабораторий строит подтверждение через этот хелпер", () => {
    const src = readFileSync("app/(app)/labs/page.tsx", "utf8")
    expect(src).toContain("labDeleteConfirmText(t, lab.name)")
    expect(src).not.toContain('t("labsPage.deleteConfirm"')
  })
})
