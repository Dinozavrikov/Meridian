"use client"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"

export function RoadmapCta() {
  const t = useT()
  const { user } = useStore()
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 32, borderTop: `1px solid ${v2.bd}` }}>
      <a className="feat-cta feat-cta--primary" href={user ? "/dashboard" : "/register"}>
        {t(user ? "roadmapPage.cta.dashboard" : "roadmapPage.cta.register")}
      </a>
      <a className="feat-cta" href="/features">{t("roadmapPage.cta.features")}</a>
    </div>
  )
}
