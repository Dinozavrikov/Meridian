"use client"
import { CircleSlash, Cpu, Lock, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/contact"
import { COOKIE_PURPOSES, DATA_ROW_IDS, DELETION_IDS, PARTNER_IDS, PROMISE_IDS, dataRowKeys, deletionKeys, formatTtl, partnerKeys, promiseKeys, purposeKey } from "@/lib/privacy"
import { body, card, grid, h3, linkBtn } from "@/components/docs/docs-style"
import { usePrivacy, usePrivacyText } from "./privacy-context"
import { PrivacyCards } from "./PrivacyCards"
import { PrivacyTable } from "./PrivacyTable"

const PROMISE_STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  analytics: { icon: CircleSlash, color: v2.teal },
  records: { icon: Lock, color: "#4A90D9" },
  ai: { icon: Cpu, color: "#a78bfa" },
  control: { icon: SlidersHorizontal, color: v2.amber },
}
const mono = { fontFamily: "var(--font-mono, monospace)", fontSize: 13, color: v2.t1 } as const

export function PrivacySummary() {
  const d = usePrivacyText()
  return (
    <div style={grid(250)}>
      {PROMISE_IDS.map(id => {
        const { icon: Icon, color } = PROMISE_STYLE[id]
        const k = promiseKeys(id)
        return (
          <article key={id} className="docs-card" style={{ ...card, borderTop: `2px solid ${color}` }}>
            <h3 style={{ ...h3, display: "flex", alignItems: "center", gap: 8 }}><Icon size={16} color={color} aria-hidden />{d(k.title)}</h3>
            <p style={body}>{d(k.text)}</p>
          </article>
        )
      })}
    </div>
  )
}

export function PrivacyData() {
  const t = useT()
  const d = usePrivacyText()
  const rows = DATA_ROW_IDS.map(id => { const k = dataRowKeys(id); return [d(k.what), d(k.why), d(k.term)] })
  return (
    <>
      <PrivacyTable cols={[t("privacyPage.data.col.what"), t("privacyPage.data.col.why"), t("privacyPage.data.col.term")]} rows={rows} />
      <p style={{ ...body, marginTop: 14, fontSize: 13 }}>{t("privacyPage.data.note")}</p>
    </>
  )
}

export function PrivacyStorage() {
  const t = useT()
  const d = usePrivacyText()
  const { facts } = usePrivacy()
  const cookies = facts?.cookies ?? COOKIE_PURPOSES.map(purpose => ({ name: "…", purpose, ttl_seconds: 0 }))
  const rows = cookies.map(c => [
    <span key="n" style={mono}>{c.name}</span>,
    d(purposeKey(c.purpose)),
    facts ? formatTtl(t, c.ttl_seconds) : "…",
  ])
  return (
    <>
      <PrivacyTable cols={[t("privacyPage.storage.col.name"), t("privacyPage.storage.col.purpose"), t("privacyPage.storage.col.ttl")]} rows={rows} />
      <p style={{ ...body, margin: "14px 0 20px", fontSize: 13 }}>{t("privacyPage.storage.note")}</p>
      <article style={card}>
        <h3 style={h3}>{t("privacyPage.storage.local.title")}</h3>
        <p style={body}>{t("privacyPage.storage.local.text")}</p>
      </article>
    </>
  )
}

export const PrivacyPartners = () => <PrivacyCards ids={PARTNER_IDS} keys={partnerKeys} min={260} />

export function PrivacyDeletion() {
  const t = useT()
  const extras = {
    export: <a className="docs-btn" href="/settings/export" style={linkBtn}>{t("privacyPage.link.export")} →</a>,
    account: <a className="docs-btn" href="/settings/security" style={linkBtn}>{t("privacyPage.link.security")} →</a>,
  }
  return <PrivacyCards ids={DELETION_IDS} keys={deletionKeys} extras={extras} />
}

export function PrivacyContact() {
  const t = useT()
  return (
    <article style={{ ...card, display: "grid", gap: 14, justifyItems: "start" }}>
      <a className="feat-cta feat-cta--primary" href={CONTACT_HREF}>{t("privacyPage.contact.write")}: {CONTACT_EMAIL}</a>
      <p style={body}>{t("privacyPage.contact.changes")}</p>
      <p style={{ ...body, fontSize: 13, color: v2.t4 }}>{t("privacyPage.contact.law")}</p>
    </article>
  )
}
