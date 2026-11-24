"use client"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { fmtNumber, useMaturityModel } from "@/lib/maturity-model"
import { HOME_KEYS, HOME_POINTS, MATURITY_PENDING_KEY, pointKeys, type HomePointId } from "@/lib/site/home"
import { v2 } from "@/lib/theme"

export function HomeContent() {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale) as string
  const { data: model } = useMaturityModel()

  // Число уровней приходит из модели зрелости на сервере (единый источник), руками его в тексте не пишем.
  const pointTitle = (id: HomePointId) => {
    if (id !== "maturity") return t(pointKeys(id).title)
    if (!model) return t(MATURITY_PENDING_KEY)
    return t(pointKeys(id).title, {
      min: fmtNumber(model.levels.min, locale, 0),
      max: fmtNumber(model.levels.max, locale, 0),
    })
  }

  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "56px 20px 72px" }}>
      <h1 style={{ margin: "0 0 20px", maxWidth: 860, fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1 }}>
        {t(HOME_KEYS.title)}
      </h1>
      <p style={{ margin: "0 0 32px", maxWidth: 720, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t(HOME_KEYS.lead)}</p>
      <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {HOME_POINTS.map(id => (
          <li key={id} style={{ background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 12, padding: 20 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: v2.t1 }}>{pointTitle(id)}</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: v2.t2 }}>{t(pointKeys(id).text)}</p>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "0 0 20px" }}>
        {user ? (
          <Link className="feat-cta feat-cta--primary" href="/dashboard">{t(HOME_KEYS.ctaApp)}</Link>
        ) : (
          <>
            <Link className="feat-cta feat-cta--primary" href="/register">{t(HOME_KEYS.ctaRegister)}</Link>
            <Link className="feat-cta" href="/login">{t(HOME_KEYS.ctaLogin)}</Link>
          </>
        )}
      </div>
      <p style={{ margin: 0, maxWidth: 640, fontSize: 13, lineHeight: 1.6, color: v2.t3 }}>{t(HOME_KEYS.privacy)}</p>
    </section>
  )
}
