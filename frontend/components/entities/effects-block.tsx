"use client"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { safeEntityHref } from "@/lib/entity-routes"
import { readableOn } from "@/lib/color"
import { EffectChip } from "@/components/entities/effect-chip"
import type { LinkEffect } from "@/lib/link-effect"
import { ink, typeColor } from "@/lib/theme"

export interface HypothesisEffect { hypothesis_id: number; hypothesis_name: string; effect: LinkEffect | null }

/** Блок «Вклад в сигнал гипотезы» для карточек предпросмотра (дашборд, граф): у прогноза один чип,
 *  у наблюдения список «гипотеза → чип». Нечего показывать (чужая запись, другой тип) — блока нет. */
export function EffectsBlock({ type, effect, effects }: { type: string; effect?: LinkEffect | null; effects?: HypothesisEffect[] }) {
  const t = useT()
  const rows = (effects ?? []).filter(e => e.effect)
  if (["question", "task", "worldview"].includes(type)) {
    return <div data-testid="effects-none" style={{ fontSize: 12, color: ink.muted, paddingTop: 10, borderTop: `1px solid ${ink.line}` }}>{t("effect.none")}</div>
  }
  if (!(type === "prediction" && effect) && !(type === "observation" && rows.length)) return null
  return (
    <div data-testid="effects-block" style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: `1px solid ${ink.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{t("effect.label")}</div>
      {type === "prediction" && effect && <EffectChip effect={effect} otherType="prediction" />}
      {type === "observation" && rows.map(e => (
        <div key={e.hypothesis_id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Link href={safeEntityHref("hypothesis", e.hypothesis_id)} data-testid="effect-hypothesis-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: readableOn(typeColor.hypothesis ?? "#4A90D9") }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: typeColor.hypothesis ?? "#4A90D9" }} />
            <span style={{ overflowWrap: "anywhere", borderBottom: `1px dashed ${(typeColor.hypothesis ?? "#4A90D9")}88` }}>{e.hypothesis_name}</span>
            <ArrowUpRight size={12} aria-hidden style={{ flexShrink: 0 }} />
          </Link>
          <EffectChip effect={e.effect!} otherType="observation" />
        </div>
      ))}
    </div>
  )
}
