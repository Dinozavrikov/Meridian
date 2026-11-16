"use client"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { body, h3 } from "./docs-style"

export function DocsCta() {
  const t = useT()
  const { user } = useStore()
  return (
    <section style={{ marginTop: 72, paddingTop: 32, borderTop: `1px solid ${v2.bd}` }}>
      <h2 style={{ ...h3, fontSize: 24 }}>{t("docsPage.cta.title")}</h2>
      <p style={{ ...body, maxWidth: 560, marginBottom: 20 }}>{t("docsPage.cta.text")}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a className="feat-cta feat-cta--primary" href={user ? "/observations" : "/register"}>{t(user ? "docsPage.link.start" : "docsPage.link.register")}</a>
        <a className="feat-cta" href="/features">{t("docsPage.link.features")}</a>
      </div>
    </section>
  )
}
