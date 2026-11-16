"use client"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { ACCENT } from "@/lib/utils"
import { v2 } from "@/lib/theme"

export function FeatureHero() {
  const t = useT()
  const { user } = useStore()
  return (
    <section style={{ padding: "56px 0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
        {t("page.features.eyebrow")}
      </div>
      <h1 style={{ margin: "0 0 20px", maxWidth: 860, fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1 }}>
        {t("featuresPage.hero.title")}
      </h1>
      <p style={{ margin: "0 0 30px", maxWidth: 700, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t("featuresPage.hero.lead")}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a className="feat-cta feat-cta--primary" href={user ? "/dashboard" : "/register"}>
          {t(user ? "featuresPage.hero.cta.dashboard" : "featuresPage.hero.cta.register")}
        </a>
        <a className="feat-cta" href="/roadmap">{t("featuresPage.hero.cta.roadmap")}</a>
      </div>
    </section>
  )
}
