"use client"
import type { ReactNode } from "react"
import { pluralKey } from "@/lib/i18n/ru-plural"
import { CALIBRATION_CARDS, type CardSpec } from "@/lib/docs"
import { useDocs, useDocsText } from "./docs-context"
import { body, card, grid, h3 } from "./docs-style"

interface Props {
  ns: string
  cards: readonly CardSpec[]
  counts?: Record<string, number>
  extra?: Record<string, string | number>
  extras?: Record<string, ReactNode>
  min?: number
}

/** Ряд карточек «заголовок и текст» из данных lib/docs.ts. Карточки с числительным берут форму слова по числу. */
export function DocsCards({ ns, cards, counts, extra, extras, min = 280 }: Props) {
  const d = useDocsText()
  return (
    <div style={grid(min)}>
      {cards.map(c => {
        const base = `docsPage.${ns}.${c.id}`
        const n = counts?.[c.id] ?? 0
        const key = c.plural ? pluralKey(`${base}.text`, n) : `${base}.text`
        return (
          <article key={c.id} className="docs-card" style={card}>
            <h3 style={h3}>{d(`${base}.title`)}</h3>
            <p style={body}>{d(key, { n, ...extra })}</p>
            {c.example && <p style={{ ...body, marginTop: 10, fontSize: 13, opacity: 0.75 }}>{d(`${base}.example`)}</p>}
            {extras?.[c.id]}
          </article>
        )
      })}
    </div>
  )
}

export function DocsCalibration() {
  const { model } = useDocs()
  return <DocsCards ns="calibration" cards={CALIBRATION_CARDS} counts={{ tags: model?.calibration.min_tag_n ?? 0 }} />
}
