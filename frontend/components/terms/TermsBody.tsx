"use client"
import { useCallback, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/contact"
import { CARD_GROUPS, SECTIONS, cardKeys, sectionLeadKey, sectionTitleKey, type CardGroup, type SectionId } from "@/lib/terms"
import { LegalCards } from "@/components/legal/legal-cards"
import { PageSection } from "@/components/ui/page-section"
import { body, card, linkBtn } from "@/components/docs/docs-style"

const GROUP_COLOR: Record<CardGroup, string> = {
  summary: v2.teal, account: "#4A90D9", rules: v2.red, content: "#a78bfa", service: v2.amber, ending: v2.t3,
}

function useTermsText() {
  const t = useT()
  return useCallback((key: string) => t(key, { email: CONTACT_EMAIL }), [t])
}

function TermsSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const t = useT()
  return <PageSection id={id} index={SECTIONS.indexOf(id)} title={t(sectionTitleKey(id))} lead={t(sectionLeadKey(id))}>{children}</PageSection>
}

function Group({ group, extras, min }: { group: CardGroup; extras?: Record<string, ReactNode>; min?: number }) {
  const d = useTermsText()
  const ids = CARD_GROUPS[group]
  return (
    <LegalCards ids={ids} keys={id => cardKeys(group, id)} text={d} extras={extras} min={min}
      accents={Object.fromEntries(ids.map(id => [id, GROUP_COLOR[group]]))} />
  )
}

function Contact() {
  const t = useT()
  return (
    <article style={{ ...card, display: "grid", gap: 14, justifyItems: "start" }}>
      <a className="feat-cta feat-cta--primary" href={CONTACT_HREF}>{t("termsPage.contact.write")}: {CONTACT_EMAIL}</a>
      <p style={body}>{t("termsPage.contact.privacy")} <a href="/privacy" style={{ ...linkBtn, marginTop: 0 }}>{t("termsPage.link.privacy")} →</a></p>
      <p style={{ ...body, fontSize: 13, color: v2.t4 }}>{t("termsPage.contact.law")}</p>
    </article>
  )
}

/** Все разделы условий. Порядок разделов совпадает с оглавлением (lib/terms.ts), это проверяет тест. */
export function TermsBody() {
  const t = useT()
  const link = (href: string, key: string) => <a className="docs-btn" href={href} style={linkBtn}>{t(key)} →</a>
  return (
    <>
      <TermsSection id="summary"><Group group="summary" min={250} /></TermsSection>
      <TermsSection id="account"><Group group="account" extras={{ notify: link("/settings/security", "termsPage.link.security") }} /></TermsSection>
      <TermsSection id="rules"><Group group="rules" min={250} /></TermsSection>
      <TermsSection id="content">
        <Group group="content" extras={{ export: <>{link("/settings/export", "termsPage.link.export")}{" "}{link("/privacy", "termsPage.link.privacy")}</> }} />
      </TermsSection>
      <TermsSection id="service"><Group group="service" /></TermsSection>
      <TermsSection id="ending"><Group group="ending" extras={{ leave: link("/privacy", "termsPage.link.privacy") }} /></TermsSection>
      <TermsSection id="contact"><Contact /></TermsSection>
    </>
  )
}
