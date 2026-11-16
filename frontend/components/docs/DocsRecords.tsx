"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { NODE_BY_KEY } from "@/lib/features-map"
import { RECORD_KEYS, recordRoleKey } from "@/lib/docs"
import { body, card, grid, h3, linkBtn } from "./docs-style"

export function DocsRecords() {
  const t = useT()
  return (
    <>
      <div style={grid(300)}>
        {RECORD_KEYS.map(k => {
          const n = NODE_BY_KEY[k]
          return (
            <article key={k} className="docs-card" style={{ ...card, borderLeft: `3px solid ${n.color}` }}>
              <h3 style={h3}>{t(n.nameKey)}</h3>
              <p style={{ ...body, color: v2.t2 }}>{t(recordRoleKey(k))}</p>
              <p style={{ ...body, marginTop: 8, fontSize: 13, color: v2.t4 }}>{t(n.textKey)}</p>
              {n.href && <a className="docs-btn" href={n.href} style={linkBtn}>{t("docsPage.link.open")} →</a>}
            </article>
          )
        })}
      </div>
      <article style={{ ...card, marginTop: 16, borderStyle: "dashed" }}>
        <h3 style={h3}>{t("docsPage.records.links.title")}</h3>
        <p style={body}>{t("docsPage.records.links.text")}</p>
      </article>
    </>
  )
}
