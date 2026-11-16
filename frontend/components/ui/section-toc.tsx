"use client"
import type { MouseEvent } from "react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { pad2 } from "@/lib/roadmap"
import { useScrollSpy } from "@/lib/use-scroll-spy"
import { useIsMobile } from "@/lib/use-is-mobile"

function go(e: MouseEvent, id: string) {
  e.preventDefault()
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  document.getElementById(id)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" })
  history.replaceState(null, "", `#${id}`)
}

/** Оглавление длинной страницы: слева закрепленный список, на телефоне полоса чипов. Подсвечивает раздел, который сейчас на экране. */
export function SectionToc({ ids, titleKey, labelKey }: { ids: readonly string[]; titleKey: (id: string) => string; labelKey: string }) {
  const t = useT()
  const active = useScrollSpy(ids)
  const mobile = useIsMobile(900)
  if (mobile) {
    return (
      <nav aria-label={t(labelKey)} className="docs-chips" style={{ position: "sticky", top: 52, zIndex: 5, background: v2.bg, borderBottom: `1px solid ${v2.bd}` }}>
        {ids.map(id => (
          <a key={id} href={`#${id}`} className="docs-chip" aria-current={active === id} onClick={e => go(e, id)}>{t(titleKey(id))}</a>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label={t(labelKey)} style={{ position: "sticky", top: 72, paddingTop: 56 }}>
      <div style={{ marginBottom: 12, padding: "0 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: v2.t4 }}>{t(labelKey)}</div>
      {ids.map((id, i) => (
        <a key={id} href={`#${id}`} className="docs-toc-link" aria-current={active === id} onClick={e => go(e, id)}>
          <span style={{ fontSize: 11, color: v2.t4 }}>{pad2(i + 1)}</span>{t(titleKey(id))}
        </a>
      ))}
    </nav>
  )
}
