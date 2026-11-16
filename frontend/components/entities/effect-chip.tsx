"use client"
import { useT } from "@/lib/i18n/useT"
import { describeEffect, describeLabEffect, type LinkEffect } from "@/lib/link-effect"
import { ink } from "@/lib/theme"

const TONE: Record<"pos" | "neg" | "neutral", string> = { pos: "#4dcfa6", neg: "#E74C3C", neutral: "" }

/** Чип «что эта связь вносит в сигнал гипотезы»: слово и стрелка, число и пояснение в подсказке.
 *  Один компонент на менеджер связей и карточку предпросмотра. otherType — тип записи, чей вклад показан. */
export function EffectChip({ effect, otherType }: { effect: LinkEffect; otherType: string }) {
  const t = useT()
  const lab = effect.lab ? describeLabEffect(effect.lab, otherType) : null
  const labColor = lab ? TONE[lab.tone] : ""
  const labChip = lab && (
    <span data-testid="effect-lab" style={{ display: "flex", flexDirection: "column", gap: 2, alignSelf: "flex-start" }}>
      <span title={t(lab.tipKey, { n: lab.number })}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
          border: `1px solid ${labColor ? `${labColor}59` : ink.line}`, background: labColor ? `${labColor}1f` : "transparent", color: labColor || ink.label }}>
        <span aria-hidden>{lab.arrow}</span>{t(lab.labelKey)}
      </span>
      {(lab.mine || lab.votesN != null) && (
        <span style={{ fontSize: 11, color: ink.label, lineHeight: 1.4 }}>
          {lab.mine && <span data-testid="effect-lab-mine">{t("effectLab.mine", { n: lab.mine })}</span>}
          {lab.mine && lab.votesN != null && " · "}
          {lab.votesN != null && <span data-testid="effect-lab-votes">{t("effectLab.votes", { n: lab.votesN, pct: lab.votesPct ?? 0 })}</span>}
        </span>
      )}
    </span>
  )
  if (effect.kind === "lab_only") return labChip
  const v = describeEffect(effect, otherType)
  const color = TONE[v.tone]
  const title = v.number != null ? t(v.tipKey, { n: v.number }) : t(v.tipKey)
  const personal = (
    <span data-testid="effect-chip" data-effect-kind={effect.kind} title={title}
      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
        border: `1px solid ${color ? `${color}59` : ink.line}`, background: color ? `${color}1f` : "transparent", color: color || ink.label }}>
      <span aria-hidden>{v.arrow}</span>{t(v.labelKey)}
    </span>
  )
  if (!labChip) return personal
  return <span style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start" }}>{personal}{labChip}</span>
}

