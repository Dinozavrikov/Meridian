"use client"
import Link from "next/link"
import { Check } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { AUDIENCE_KEYS as A, DATA_ITEM_IDS, DATA_LINK_KEY, FINAL_KEYS, SECTION_KEYS, dataItemKey } from "@/lib/site/home"
import { HomeExample } from "@/components/site/home-example"
import { HomeSection, cardStyle, h3Style, pStyle } from "@/components/site/home-section"
import { HomeCta } from "@/components/site/home-cta"

export function HomeAudience() {
  const t = useT()
  return (
    <HomeSection title={t(SECTION_KEYS.audience.title)} lead={t(SECTION_KEYS.audience.lead)}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <div style={cardStyle}>
          <h3 style={h3Style}>{t(A.decideTitle)}</h3>
          <p style={{ ...pStyle, marginBottom: 10 }}>{t(A.decideText)}</p>
          <p style={pStyle}>{t(A.decideExtra)}</p>
        </div>
        <div style={cardStyle}>
          <h3 style={h3Style}>{t(A.researchTitle)}</h3>
          <p style={pStyle}>{t(A.researchText)}</p>
          <HomeExample k={A.researchExample} />
        </div>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: v2.t3 }}>{t(A.note)}</p>
    </HomeSection>
  )
}

export function HomeData() {
  const t = useT()
  return (
    <HomeSection title={t(SECTION_KEYS.data.title)} lead={t(SECTION_KEYS.data.lead)}>
      <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 10 }}>
        {DATA_ITEM_IDS.map(id => (
          <li key={id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, lineHeight: 1.6, color: v2.t2 }}>
            <Check size={16} style={{ color: v2.teal, flexShrink: 0, marginTop: 4 }} />
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t(dataItemKey(id))}</span>
          </li>
        ))}
      </ul>
      <Link className="feat-link" href="/privacy" style={{ fontSize: 14 }}>{t(DATA_LINK_KEY)}</Link>
    </HomeSection>
  )
}

export function HomeFinal() {
  const t = useT()
  return (
    <HomeSection title={t(SECTION_KEYS.final.title)} lead={t(SECTION_KEYS.final.lead)}>
      <div style={{ marginBottom: 16 }}><HomeCta /></div>
      <Link className="feat-link" href="/docs#maturity" style={{ fontSize: 14 }}>{t(FINAL_KEYS.docs)}</Link>
    </HomeSection>
  )
}
