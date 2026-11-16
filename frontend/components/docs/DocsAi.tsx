"use client"
import { useT } from "@/lib/i18n/useT"
import { AI_ABILITIES } from "@/lib/roadmap"
import { AI_CARDS } from "@/lib/docs"
import { DocsCards } from "./DocsCards"
import { body, card, grid, h3, linkBtn } from "./docs-style"

export function DocsAi() {
  const t = useT()
  return (
    <>
      <DocsCards ns="ai" cards={AI_CARDS} />
      <h3 style={{ ...h3, margin: "32px 0 14px", fontSize: 18 }}>{t("docsPage.abilities.title")}</h3>
      <div style={grid(240)}>
        {AI_ABILITIES.map(a => (
          <article key={a} className="docs-card" style={{ ...card, padding: "16px 18px" }}>
            <h4 style={{ ...h3, fontSize: 15 }}>{t(`roadmapPage.ai.${a}.name`)}</h4>
            <p style={{ ...body, fontSize: 13 }}>{t(`roadmapPage.ai.${a}.text`)}</p>
          </article>
        ))}
      </div>
      <a className="docs-btn" href="/roadmap" style={linkBtn}>{t("docsPage.link.roadmap")} →</a>
    </>
  )
}
