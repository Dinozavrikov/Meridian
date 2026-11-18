"use client"
import { useMemo, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { v2 } from "@/lib/theme"

export interface LegalRevision { version: string; date: string }

interface Props {
  color: string
  eyebrowKey: string
  titleKey: string
  accentKey: string
  leadKey: string
  revision?: LegalRevision
  notice?: ReactNode
  children?: ReactNode
}

const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, fontSize: 12 } as const

/** Герой правовой страницы: заголовок с акцентом, вводная строка и штамп редакции (номер и дата). */
export function LegalHero({ color, eyebrowKey, titleKey, accentKey, leadKey, revision, notice, children }: Props) {
  const t = useT()
  const locale = useStore(s => s.locale) as string
  const date = useMemo(() => {
    if (!revision) return ""
    try { return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(revision.date)) } catch { return revision.date }
  }, [locale, revision])
  const title = t(titleKey)
  const accent = t(accentKey)
  const at = title.indexOf(accent)
  return (
    <section style={{ padding: "56px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
        {t(eyebrowKey)}
      </div>
      <h1 style={{ margin: "0 0 20px", maxWidth: 860, fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1 }}>
        {at >= 0 ? <>{title.slice(0, at)}<span style={{ color }}>{accent}</span>{title.slice(at + accent.length)}</> : title}
      </h1>
      <p style={{ margin: "0 0 24px", maxWidth: 720, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t(leadKey)}</p>
      {revision && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...chip, color, background: `${color}14`, border: `1px solid ${color}33` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />{t("legalPage.stamp.active")}
        </span>
        <span style={{ ...chip, color: v2.t3, border: `1px solid ${v2.bd2}`, fontFamily: "var(--font-mono, monospace)" }}>{t("legalPage.stamp.rev", { version: revision.version })}</span>
        <span style={{ fontSize: 12, color: v2.t3 }}>{t("legalPage.stamp.since", { date })}</span>
      </div>}
      {children}
      {notice}
    </section>
  )
}
