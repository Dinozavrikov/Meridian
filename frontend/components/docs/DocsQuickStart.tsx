"use client"
import { useT } from "@/lib/i18n/useT"
import { NODE_BY_KEY } from "@/lib/features-map"
import { STEP_IDS, STEP_NODE, stepKeys } from "@/lib/docs"
import { body, card, eyebrow, grid, h3, linkBtn } from "./docs-style"

export function DocsQuickStart() {
  const t = useT()
  return (
    <div style={grid(240)}>
      {STEP_IDS.map((id, i) => {
        const node = NODE_BY_KEY[STEP_NODE[id]]
        const k = stepKeys(id)
        return (
          <article key={id} className="docs-card" style={{ ...card, borderTop: `2px solid ${node.color}` }}>
            <div style={{ ...eyebrow, color: node.color }}>{t("docsPage.stepLabel", { n: i + 1 })}</div>
            <h3 style={h3}>{t(k.title)}</h3>
            <p style={body}>{t(k.text)}</p>
            {node.href && <a className="docs-btn" href={node.href} style={{ ...linkBtn, color: node.color }}>{t("docsPage.link.open")} →</a>}
          </article>
        )
      })}
    </div>
  )
}
