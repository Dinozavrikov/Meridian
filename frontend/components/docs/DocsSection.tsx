"use client"
import type { ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { SECTIONS, sectionLeadKey, sectionTitleKey, type SectionId } from "@/lib/docs"
import { PageSection } from "@/components/ui/page-section"

export function DocsSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const t = useT()
  return <PageSection id={id} index={SECTIONS.indexOf(id)} title={t(sectionTitleKey(id))} lead={t(sectionLeadKey(id))}>{children}</PageSection>
}
