"use client"
import { useT } from "@/lib/i18n/useT"
import { VISIBILITY_LEVELS } from "@/lib/visibility-levels"
import { VISIBILITY_CARDS, VISIBILITY_ORDER } from "@/lib/docs"
import { DocsCards } from "./DocsCards"
import { body, card, grid, h3 } from "./docs-style"

export function DocsVisibility() {
  const t = useT()
  return (
    <>
      <div style={{ ...grid(240), marginBottom: 16 }}>
        {VISIBILITY_ORDER.map(v => {
          const level = VISIBILITY_LEVELS.find(l => l.value === v)!
          const Icon = level.icon
          return (
            <article key={v} className="docs-card" style={{ ...card, borderTop: `2px solid ${level.color}` }}>
              <h3 style={{ ...h3, display: "flex", alignItems: "center", gap: 8 }}><Icon size={16} color={level.color} aria-hidden />{t(`visibility.${v}`)}</h3>
              <p style={body}>{t(`docsPage.visibility.level.${v}.text`)}</p>
            </article>
          )
        })}
      </div>
      <DocsCards ns="visibility" cards={VISIBILITY_CARDS} />
    </>
  )
}
