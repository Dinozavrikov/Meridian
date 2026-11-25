"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { ACCENT } from "@/lib/utils"
import { HOME_KEYS } from "@/lib/site/home"
import { HomeCta } from "@/components/site/home-cta"
import { PassportCard } from "@/components/site/passport-card"
import { DriftNetwork } from "@/components/ui/drift-network"

// Фон: свечение и медленно дрейфующая сеть узлов в цветах Meridian.
// Сеть сама замирает при настройке "уменьшить движение" и пока первый экран прокручен за границу окна.
// pointer-events: none, чтобы холст не перехватывал нажатия.
function HeroBackdrop() {
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      background: `radial-gradient(ellipse 900px 480px at 12% -10%, ${v2.teal}22, transparent 60%), radial-gradient(ellipse 700px 420px at 92% 8%, ${v2.violet}1c, transparent 60%)`,
    }}>
      <DriftNetwork />
    </div>
  )
}

export function HomeHero() {
  const t = useT()
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <HeroBackdrop />
      <section style={{
        position: "relative", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "56px 20px 24px",
        display: "grid", gap: 40, alignItems: "center", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
            {t(HOME_KEYS.eyebrow)}
          </div>
          <h1 style={{ margin: "0 0 20px", fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1, overflowWrap: "anywhere" }}>
            {t(HOME_KEYS.title)}
          </h1>
          <p style={{ margin: "0 0 28px", maxWidth: 640, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t(HOME_KEYS.lead)}</p>
          <div style={{ margin: "0 0 20px" }}><HomeCta sandbox /></div>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 13, lineHeight: 1.6, color: v2.t3 }}>{t(HOME_KEYS.privacy)}</p>
        </div>
        <PassportCard />
      </section>
    </div>
  )
}
