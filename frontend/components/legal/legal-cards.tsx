"use client"
import type { ReactNode } from "react"
import { body, card, grid, h3 } from "@/components/docs/docs-style"

interface Props {
  ids: readonly string[]
  keys: (id: string) => { title: string; text: string }
  /** Перевод ключа с подстановками: каждая страница подставляет свои значения (почта, сроки). */
  text: (key: string) => string
  extras?: Record<string, ReactNode>
  accents?: Record<string, string>
  min?: number
}

/** Ряд карточек «заголовок и текст» для правовых страниц. */
export function LegalCards({ ids, keys, text, extras, accents, min = 280 }: Props) {
  return (
    <div style={grid(min)}>
      {ids.map(id => (
        <article key={id} className="docs-card" style={{ ...card, ...(accents?.[id] ? { borderTop: `2px solid ${accents[id]}` } : {}) }}>
          <h3 style={h3}>{text(keys(id).title)}</h3>
          <p style={body}>{text(keys(id).text)}</p>
          {extras?.[id]}
        </article>
      ))}
    </div>
  )
}
