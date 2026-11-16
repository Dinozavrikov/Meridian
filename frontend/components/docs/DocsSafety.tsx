"use client"
import { useT } from "@/lib/i18n/useT"
import { EXPORT_KEYS, SAFETY_CARDS } from "@/lib/docs"
import { DocsCards } from "./DocsCards"
import { linkBtn } from "./docs-style"

export function DocsSafety() {
  const t = useT()
  const items = EXPORT_KEYS.map(k => t(`docsPage.export.item.${k}`)).join(", ")
  return (
    <DocsCards ns="safety" cards={SAFETY_CARDS} extra={{ items }}
      extras={{ export: <a className="docs-btn" href="/settings/export" style={linkBtn}>{t("docsPage.link.export")} →</a> }} />
  )
}
