"use client"
import type { ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { DEFAULT_SCALES } from "@/lib/scales"
import { ink, theme, typeColor } from "@/lib/theme"

const MATURITY = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")!
const ACCENT = typeColor.hypothesis ?? "#4A90D9"
export const f2 = (n: number) => Number(n).toFixed(2)

/** Общая полоска «сигнал до следующего уровня зрелости»: личная (страница гипотезы) и лабораторная (вкладка «Сигнал»).
 *  Числа приходят готовыми с сервера, здесь только вид. showReady: подпись «достаточно» только там, где total —
 *  тот же сигнал, что идёт в предложение (у лабораторной суммы это не так). */
export function MaturityBar({ total, threshold, nextLevel, titleKey, showReady, children }: {
  total: number; threshold: number | null; nextLevel: number | null; titleKey: string; showReady: boolean; children?: ReactNode
}) {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  if (nextLevel == null || threshold == null) {
    return <div data-testid="maturity-progress-top" style={{ fontSize: 12, color: ink.label }}>{t("maturityProgress.top")}</div>
  }
  const ratio = threshold > 0 ? Math.min(Math.max(total / threshold, 0), 1) : 1
  const pct = Math.round(ratio * 100)
  const level = dt(MATURITY.levels[nextLevel]?.label ?? String(nextLevel))
  const ready = showReady && total >= threshold
  return (
    <section data-testid="maturity-progress" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{t(titleKey)}</span>
        <span style={{ color: theme.tx1 }}>
          {ready ? t("maturityProgress.ready", { level }) : t("maturityProgress.caption", { total: f2(total), threshold: f2(threshold), level })}
        </span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ height: 6, borderRadius: 999, background: ink.line, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: ACCENT, transition: "width .3s" }} />
      </div>
      {children}
    </section>
  )
}
