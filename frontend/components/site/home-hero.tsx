"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { ACCENT } from "@/lib/utils"
import { HOME_KEYS } from "@/lib/site/home"
import { HomeCta } from "@/components/site/home-cta"
import { PassportCard } from "@/components/site/passport-card"

// Статичный фон: свечение и сеть узлов в цветах Meridian. Без анимации, чтобы страница не грела телефон.
const NODES: [number, number][] = [[80, 90], [250, 40], [420, 140], [640, 60], [820, 170], [1010, 80], [1130, 200], [180, 260], [520, 300], [760, 330], [980, 360]]
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [0, 7], [7, 8], [2, 8], [8, 9], [4, 9], [9, 10], [6, 10]]

function HeroBackdrop() {
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      background: `radial-gradient(ellipse 900px 480px at 12% -10%, ${v2.teal}22, transparent 60%), radial-gradient(ellipse 700px 420px at 92% 8%, ${v2.violet}1c, transparent 60%)`,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" style={{ opacity: 0.55 }}>
        {EDGES.map(([a, b]) => <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke={v2.teal} strokeOpacity={0.14} />)}
        {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3 : 2} fill={i % 2 ? v2.violet : v2.teal} fillOpacity={0.45} />)}
      </svg>
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
          <div style={{ margin: "0 0 20px" }}><HomeCta /></div>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 13, lineHeight: 1.6, color: v2.t3 }}>{t(HOME_KEYS.privacy)}</p>
        </div>
        <PassportCard />
      </section>
    </div>
  )
}
