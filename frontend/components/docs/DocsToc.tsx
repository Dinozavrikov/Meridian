"use client"
import { SECTIONS, sectionTitleKey, type SectionId } from "@/lib/docs"
import { SectionToc } from "@/components/ui/section-toc"

export function DocsToc() {
  return <SectionToc ids={SECTIONS} titleKey={id => sectionTitleKey(id as SectionId)} labelKey="docsPage.toc.label" />
}
