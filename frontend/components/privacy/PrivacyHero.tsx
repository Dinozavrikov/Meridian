"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { PRIVACY_REVISION } from "@/lib/privacy"
import { LegalHero } from "@/components/legal/legal-hero"
import { usePrivacy } from "./privacy-context"

export function PrivacyHero() {
  const t = useT()
  const { failed } = usePrivacy()
  return (
    <LegalHero
      color="#4dcfa6" eyebrowKey="privacyPage.eyebrow" titleKey="privacyPage.hero.title" accentKey="privacyPage.hero.accent"
      leadKey="privacyPage.hero.lead" revision={PRIVACY_REVISION}
      notice={failed ? <p role="alert" style={{ margin: "16px 0 0", fontSize: 14, color: v2.amber }}>{t("privacyPage.modelError")}</p> : null}
    />
  )
}
