"use client"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { safeEntityHref } from "@/lib/entity-routes"
import { ink, theme, typeColor } from "@/lib/theme"
import { readableOn } from "@/lib/color"

export interface BatchPreview {
  hypotheses: { hypothesis_id: number; name: string; before: number; after: number; level_before: number; level_after: number }[]
  pending_predictions: number
}

const num = (v: number) => v.toFixed(2)

/** Итог пробного запуска пакета (ответ POST .../links/batch/preview): что станет с сигналом гипотез ДО нажатия кнопки.
 *  Числа считает сервер теми же функциями, что и настоящий пакет; здесь только показ. */
export function BatchImpact({ data }: { data: BatchPreview }) {
  const t = useT()
  const hyps = data.hypotheses ?? []
  const pending = data.pending_predictions ?? 0
  if (!hyps.length && !pending) return null
  const color = typeColor.hypothesis ?? "#4A90D9"
  return (
    <div data-testid="batch-impact" style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 8, background: ink.well, border: `1px solid ${ink.line}` }}>
      {hyps.map(h => (
        <div key={h.hypothesis_id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
          <Link href={safeEntityHref("hypothesis", h.hypothesis_id)} data-testid="batch-impact-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13, fontWeight: 600, textDecoration: "none", color: readableOn(color) }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: color }} />
            <span style={{ overflowWrap: "anywhere", borderBottom: `1px dashed ${color}88` }}>{h.name}</span>
            <ArrowUpRight size={12} aria-hidden style={{ flexShrink: 0 }} />
          </Link>
          <span style={{ fontFamily: theme.mono, fontSize: 12, color: h.after < h.before ? "#E74C3C" : "#4dcfa6" }}>{`${num(h.before)} → ${num(h.after)}`}</span>
          {h.level_before !== h.level_after && (
            <span style={{ fontSize: 12, color: "#F5A623" }}>{t("relations.batch.levelChange", { a: String(h.level_before), b: String(h.level_after) })}</span>
          )}
        </div>
      ))}
      {pending > 0 && <div style={{ fontSize: 12, color: ink.muted }}>{t("relations.batch.pending", { n: String(pending) })}</div>}
    </div>
  )
}
