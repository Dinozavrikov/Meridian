"use client"
import { useState, type CSSProperties, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { LegalHero } from "@/components/legal/legal-hero"
import { card, grid, h3, body, eyebrow, linkBtn } from "@/components/docs/docs-style"
import { CARD_METHODS, CRYPTO } from "@/lib/support"
import { REPO_URL, ISSUES_URL, LICENSE_URL, EXTERNAL_LINK_PROPS } from "@/lib/project-links"

const EXT = EXTERNAL_LINK_PROPS
const h2: CSSProperties = { margin: "0 0 8px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: v2.t1 }
const lead: CSSProperties = { margin: "0 0 20px", maxWidth: 720, fontSize: 15, lineHeight: 1.6, color: v2.t2 }

function Section({ eyebrowText, title, leadText, children }: { eyebrowText: string; title: string; leadText?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 56 }}>
      <div style={eyebrow}>{eyebrowText}</div>
      <h2 style={h2}>{title}</h2>
      {leadText && <p style={lead}>{leadText}</p>}
      {children}
    </section>
  )
}

function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch { /* буфер недоступен: адрес можно выделить и скопировать вручную */ }
  }
  return (
    <button type="button" onClick={copy} aria-live="polite" style={{
      marginTop: 14, padding: "6px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
      color: done ? v2.bg : v2.teal, background: done ? v2.teal : "transparent", border: `1px solid ${v2.teal}`,
    }}>{done ? t("support.copied") : t("support.copy")}</button>
  )
}

export function SupportContent() {
  const t = useT()
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", paddingBottom: 72, ["--docs-accent" as string]: v2.teal }}>
      <LegalHero color={v2.teal} eyebrowKey="support.eyebrow" titleKey="support.hero.title" accentKey="support.hero.accent" leadKey="support.hero.lead" />

      <Section eyebrowText={t("support.money.eyebrow")} title={t("support.money.title")} leadText={t("support.money.lead")}>
        <div style={grid(300)}>
          {CARD_METHODS.map(m => (
            <div key={m.id} style={card}>
              <h3 style={h3}>{t(m.nameKey)}</h3>
              <p style={body}>{t(m.descKey)}</p>
              <a href={m.url} {...EXT} style={linkBtn}>{t("support.method.open")} →</a>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrowText={t("support.crypto.eyebrow")} title={t("support.crypto.title")} leadText={t("support.crypto.lead")}>
        <div style={grid(300)}>
          {CRYPTO.map(c => (
            <div key={c.id} style={card}>
              <h3 style={h3}>{t(c.nameKey)} <span style={{ color: v2.t3, fontWeight: 500 }}>{c.symbol}</span></h3>
              <code style={{ display: "block", marginTop: 8, fontSize: 13, lineHeight: 1.5, color: v2.t2, wordBreak: "break-all", userSelect: "all", fontFamily: "var(--font-mono, monospace)" }}>{c.address}</code>
              <CopyButton text={c.address} />
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrowText={t("support.use.eyebrow")} title={t("support.use.title")}>
        <p style={{ ...lead, margin: 0 }}>{t("support.use.body")}</p>
      </Section>

      <Section eyebrowText={t("support.other.eyebrow")} title={t("support.other.title")}>
        <div style={grid(260)}>
          <div style={card}>
            <h3 style={h3}>{t("support.other.star.title")}</h3>
            <p style={body}>{t("support.other.star.body")}</p>
            <a href={REPO_URL} {...EXT} style={linkBtn}>{t("support.other.star.cta")} →</a>
          </div>
          <div style={card}>
            <h3 style={h3}>{t("support.other.issue.title")}</h3>
            <p style={body}>{t("support.other.issue.body")}</p>
            <a href={ISSUES_URL} {...EXT} style={linkBtn}>{t("support.other.issue.cta")} →</a>
          </div>
          <div style={card}>
            <h3 style={h3}>{t("support.other.share.title")}</h3>
            <p style={body}>{t("support.other.share.body")}</p>
          </div>
          <div style={card}>
            <h3 style={h3}>{t("support.other.lab.title")}</h3>
            <p style={body}>{t("support.other.lab.body")}</p>
            <a href="/labs" style={linkBtn}>{t("support.other.lab.cta")} →</a>
          </div>
        </div>
      </Section>

      <p style={{ ...body, marginTop: 48 }}>
        {t("support.license")} <a href={LICENSE_URL} {...EXT} style={{ color: v2.teal, textDecoration: "none" }}>{t("support.license.link")}</a>
      </p>
    </div>
  )
}
