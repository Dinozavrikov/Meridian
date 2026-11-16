"use client"
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ACCENT } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import { FAQ_IDS, SECTIONS, faqKeys, sectionLeadKey, sectionTitleKey } from "@/lib/docs"
import { searchDocs, type DocsEntry } from "@/lib/docs-search"
import { useDocs, useDocsText } from "./docs-context"

export function DocsHero() {
  const t = useT()
  const d = useDocsText()
  const { failed } = useDocs()
  const [query, setQuery] = useState("")
  const entries = useMemo<DocsEntry[]>(() => [
    ...SECTIONS.map(id => ({ id: String(id), kind: "section" as const, title: d(sectionTitleKey(id)), body: d(sectionLeadKey(id)) })),
    ...FAQ_IDS.map(id => ({ id: `faq-${id}`, kind: "faq" as const, title: d(faqKeys(id).q), body: d(faqKeys(id).a) })),
  ], [d])
  const found = useMemo(() => searchDocs(entries, query), [entries, query])
  const title = t("docsPage.hero.title")
  const accent = t("docsPage.hero.accent")
  const at = title.indexOf(accent)
  const searching = query.trim().length >= 2
  return (
    <section style={{ padding: "56px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT }} />
        {t("docsPage.eyebrow")}
      </div>
      <h1 style={{ margin: "0 0 20px", maxWidth: 860, fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 600, letterSpacing: "-0.03em", color: v2.t1 }}>
        {at >= 0 ? <>{title.slice(0, at)}<span style={{ color: v2.teal }}>{accent}</span>{title.slice(at + accent.length)}</> : title}
      </h1>
      <p style={{ margin: "0 0 28px", maxWidth: 720, fontSize: 18, lineHeight: 1.6, color: v2.t2 }}>{t("docsPage.hero.lead")}</p>
      {failed && <p role="alert" style={{ margin: "0 0 16px", fontSize: 14, color: v2.amber }}>{t("docsPage.modelError")}</p>}
      <div style={{ position: "relative", maxWidth: 640 }}>
        <Search size={16} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: v2.t3 }} />
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") setQuery("") }}
          aria-label={t("docsPage.search.label")} placeholder={t("docsPage.search.placeholder")}
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px 13px 40px", fontSize: 15, color: v2.t1, background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 12, outline: "none" }}
        />
      </div>
      {searching && (found.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, maxWidth: 640, display: "grid", gap: 6 }}>
          {found.map(e => (
            <li key={e.id}>
              <a href={`#${e.id}`} onClick={() => setQuery("")} className="docs-card"
                style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 14px", borderRadius: 10, background: v2.surf, border: `1px solid ${v2.bd}`, textDecoration: "none", color: v2.t1, fontSize: 14 }}>
                <span style={{ flex: "none", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: v2.teal }}>
                  {t(e.kind === "faq" ? "docsPage.search.kindFaq" : "docsPage.search.kindSection")}
                </span>
                {e.title}
              </a>
            </li>
          ))}
        </ul>
      ) : <p style={{ margin: "12px 0 0", fontSize: 14, color: v2.t3 }}>{t("docsPage.search.empty")}</p>)}
    </section>
  )
}
