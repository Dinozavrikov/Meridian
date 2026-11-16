"use client"
import { useT } from "@/lib/i18n/useT"
import { pad2 } from "@/lib/roadmap"
import { STAGE_VALUES, stageLabel } from "@/lib/stage-labels"
import { body, card, eyebrow, grid, h3 } from "./docs-style"

export function DocsStages() {
  const t = useT()
  return (
    <>
      <p style={{ ...body, maxWidth: 720, marginBottom: 20 }}>{t("docsPage.stages.note")}</p>
      <ol style={{ ...grid(190), listStyle: "none", padding: 0, margin: "0 0 16px" }}>
        {STAGE_VALUES.map((s, i) => (
          <li key={s} className="docs-card" style={{ ...card, padding: "16px 18px" }}>
            <div style={eyebrow}>{pad2(i + 1)}</div>
            <div style={h3}>{stageLabel(t, s)}</div>
            <p style={{ ...body, fontSize: 13 }}>{t(`featuresPage.stageHint.${s}`)}</p>
          </li>
        ))}
      </ol>
      <article style={card}>
        <h3 style={h3}>{t("docsPage.stages.independent.title")}</h3>
        <p style={body}>{t("docsPage.stages.independent.text")}</p>
      </article>
    </>
  )
}
