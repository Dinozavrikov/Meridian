"use client"
import type { CSSProperties } from "react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { FORMULA_TERM_IDS, PRINCIPLES } from "@/lib/docs"
import { fmtNumber } from "@/lib/maturity-model"
import { useDocs, useDocsText } from "./docs-context"
import { useMaturityLevels } from "./use-maturity-levels"
import { body, card, grid, h3 } from "./docs-style"

const PRINCIPLE_COLOR = { surprise: v2.teal, miss: v2.red, risk: v2.amber } as const
const th: CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: v2.t4, borderBottom: `1px solid ${v2.bd2}` }
const td: CSSProperties = { padding: "12px", borderBottom: `1px solid ${v2.bd}`, color: v2.t2, verticalAlign: "top" }

export function DocsFormula() {
  const t = useT()
  const d = useDocsText()
  const { model, locale } = useDocs()
  const lv = useMaturityLevels()
  const risks = model?.risk.table ?? []
  return (
    <>
      <div style={grid(260)}>
        {PRINCIPLES.map(id => (
          <article key={id} className="docs-card" style={{ ...card, borderTop: `2px solid ${PRINCIPLE_COLOR[id]}` }}>
            <h3 style={h3}>{d(`docsPage.principle.${id}.title`)}</h3>
            <p style={body}>{d(`docsPage.principle.${id}.text`)}</p>
          </article>
        ))}
      </div>

      <h3 style={{ ...h3, margin: "44px 0 6px", fontSize: 22 }}>{t("docsPage.formula.title")}</h3>
      <p style={{ ...body, marginBottom: 20 }}>{t("docsPage.formula.lead")}</p>
      <div style={{ ...card, marginBottom: 16 }}>
        <div className="docs-eq" style={{ fontSize: 15, lineHeight: 1.8, color: v2.t1 }}>{d("docsPage.formula.total")}</div>
        <div className="docs-eq" style={{ fontSize: 15, lineHeight: 1.8, color: v2.teal }}>{d("docsPage.formula.level")}</div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {FORMULA_TERM_IDS.map(id => (
          <article key={id} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20 }}>
            <div>
              <h4 style={{ ...h3, fontSize: 15 }}>{d(`docsPage.formula.term.${id}.name`)}</h4>
              <p style={body}>{d(`docsPage.formula.term.${id}.text`)}</p>
            </div>
            <div className="docs-eq" style={{ alignSelf: "start", padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: v2.t1, background: v2.bg, border: `1px solid ${v2.bd}`, borderRadius: 10 }}>
              {d(`docsPage.formula.term.${id}.eq`)}
            </div>
          </article>
        ))}
      </div>

      <h3 style={{ ...h3, margin: "44px 0 6px", fontSize: 22 }}>{t("docsPage.levels.title")}</h3>
      <p style={{ ...body, marginBottom: 16 }}>{t("docsPage.levels.lead")}</p>
      <div style={{ ...card, padding: "8px 8px 4px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th scope="col" style={th}>{t("docsPage.levels.colLevel")}</th>
              {risks.map(r => <th key={r.risk} scope="col" style={{ ...th, textAlign: "right" }}>{d("docsPage.levels.riskCol", { r: r.risk })}</th>)}
            </tr>
          </thead>
          <tbody>
            {lv.levels.map(l => (
              <tr key={l.value}>
                <td style={td}>
                  <b style={{ color: v2.teal, marginRight: 10 }}>{l.value}</b>
                  <span style={{ color: v2.t1 }}>{lv.label(l.value)}</span>
                  <span style={{ display: "block", marginLeft: 22, fontSize: 13, color: v2.t4 }}>{lv.desc(l.value)}</span>
                </td>
                {risks.map(r => {
                  const x = r.thresholds[l.value]
                  return <td key={r.risk} style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x === undefined ? "…" : fmtNumber(x, locale)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...body, marginTop: 12, fontSize: 13 }}>{t("docsPage.levels.note")}</p>
    </>
  )
}
