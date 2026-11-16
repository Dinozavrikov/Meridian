"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { TERMS_REVISION } from "@/lib/terms"
import { LegalHero } from "@/components/legal/legal-hero"

export function TermsHero() {
  const t = useT()
  return (
    <LegalHero
      color="#4A90D9" eyebrowKey="termsPage.eyebrow" titleKey="termsPage.hero.title" accentKey="termsPage.hero.accent"
      leadKey="termsPage.hero.lead" revision={TERMS_REVISION}
    >
      <p style={{ margin: "20px 0 0", maxWidth: 640, fontSize: 13, lineHeight: 1.6, color: v2.t3 }}>{t("termsPage.accept")}</p>
    </LegalHero>
  )
}
