"use client"
import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { FAQ_IDS, faqKeys, type FaqId } from "@/lib/docs"
import { useDocsText } from "./docs-context"
import { body } from "./docs-style"

const ids: readonly string[] = FAQ_IDS
function hashId(): FaqId | null {
  const m = /^#faq-(.+)$/.exec(window.location.hash)
  return m && ids.includes(m[1]) ? (m[1] as FaqId) : null
}

/** Вопросы и ответы. У каждого вопроса постоянная ссылка #faq-<id>: переход по ней раскрывает ответ. */
export function DocsFaq() {
  const t = useT()
  const d = useDocsText()
  const [open, setOpen] = useState<ReadonlySet<FaqId>>(new Set())
  const [copied, setCopied] = useState<FaqId | null>(null)

  useEffect(() => {
    const sync = () => {
      const id = hashId()
      if (!id) return
      setOpen(s => new Set(s).add(id))
      requestAnimationFrame(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ block: "start" }))
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const toggle = (id: FaqId) => {
    const was = open.has(id)
    setOpen(s => { const n = new Set(s); if (was) n.delete(id); else n.add(id); return n })
    if (!was) history.replaceState(null, "", `#faq-${id}`)
  }
  const copy = async (id: FaqId) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#faq-${id}`)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* буфер недоступен: ссылка остается в адресной строке */ }
  }
  const small = { background: "none", border: "none", padding: 0, fontSize: 13, color: v2.teal, cursor: "pointer" } as const

  return (
    <>
      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <button type="button" className="docs-btn" style={small} onClick={() => setOpen(new Set(FAQ_IDS))}>{t("docsPage.faq.ui.expandAll")}</button>
        <button type="button" className="docs-btn" style={small} onClick={() => setOpen(new Set())}>{t("docsPage.faq.ui.collapseAll")}</button>
      </div>
      {FAQ_IDS.map(id => {
        const isOpen = open.has(id)
        const k = faqKeys(id)
        return (
          <div key={id} id={`faq-${id}`} className="docs-sec" style={{ borderBottom: `1px solid ${v2.bd}` }}>
            <h3 style={{ margin: 0 }}>
              <button type="button" className="docs-faq-q" aria-expanded={isOpen} aria-controls={`faq-a-${id}`} onClick={() => toggle(id)}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "18px 4px", background: "none", border: "none", textAlign: "left", fontSize: 16, fontWeight: 500, color: v2.t1, cursor: "pointer" }}>
                {d(k.q)}
                <ChevronDown size={18} aria-hidden style={{ flex: "none", color: v2.t3, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
            </h3>
            <div id={`faq-a-${id}`} className="docs-faq-a" data-open={isOpen}>
              <div>
                <p style={{ ...body, maxWidth: 720, padding: "0 4px 8px" }}>{d(k.a)}</p>
                <button type="button" className="docs-btn" style={{ ...small, margin: "0 4px 18px" }} onClick={() => copy(id)}>
                  {copied === id ? t("docsPage.faq.ui.copied") : t("docsPage.faq.ui.permalink")}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
