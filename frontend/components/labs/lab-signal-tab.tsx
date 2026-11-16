"use client"
import { useQuery } from "@tanstack/react-query"
import { labApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { safeEntityHref } from "@/lib/entity-routes"
import { PreviewLink, PreviewLinkTitle } from "@/components/entities/preview-link"
import { ink, theme, typeColor, v2 } from "@/lib/theme"
import { EffectChip } from "@/components/entities/effect-chip"
import { MaturityBar, f2 } from "@/components/entities/maturity-bar"

interface Contribution { type: "prediction" | "observation"; id: number; title: string; value: number; mine: number; votes: { n: number; mean: number } | null }
interface HypSignal {
  id: number; name: string; next_level: number | null; next_threshold: number | null; lab_total: number; rest: number
  contributions: Contribution[]; pred_signal?: number | null; obs_signal?: number | null; total_signal?: number | null
}

function Row({ c }: { c: Contribution }) {
  const color = typeColor[c.type] ?? "#4A90D9"
  return (
    <div data-testid="lab-signal-row" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderTop: `1px solid ${ink.line}` }}>
      <PreviewLink type={c.type} id={c.id} href={safeEntityHref(c.type, c.id)} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, textDecoration: "none" }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: color }} />
        <PreviewLinkTitle fontSize={13} color={theme.tx1}>{c.title}</PreviewLinkTitle>
      </PreviewLink>
      <EffectChip effect={{ kind: "lab_only", value: null, lab: { value: c.value, mine: c.mine, votes: c.votes } }} otherType={c.type} />
    </div>
  )
}

/** Вкладка «Сигнал» лаборатории: по каждой гипотезе полоска до следующего уровня и вклады, весомые сверху.
 *  Всё считает GET /labs/{id}/signal; участнику личные числа владельца не приходят. */
export function LabSignalTab({ labId }: { labId: number }) {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ["lab-signal", labId], queryFn: () => labApi.signal(labId) })
  if (isLoading) return <div style={{ padding: 24, fontSize: 12, color: v2.t3 }}>…</div>
  const hyps: HypSignal[] = data?.hypotheses ?? []
  if (!hyps.length) return <div style={{ padding: 24, fontSize: 13, color: v2.t3 }}>{t("labSignal.empty")}</div>
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 12, color: ink.label, lineHeight: 1.5, maxWidth: 720 }}>{t("labSignal.hint")}</div>
      {hyps.map(h => {
        const personal = h.total_signal != null
        const foreign = personal ? (h.total_signal as number) - (h.pred_signal ?? 0) - (h.obs_signal ?? 0) : 0
        return (
          <section key={h.id} data-testid="lab-signal-hyp" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, borderRadius: 12, background: v2.bg, border: `1px solid ${v2.bd}`, borderLeft: `3px solid ${typeColor.hypothesis ?? "#4A90D9"}` }}>
            <PreviewLink type="hypothesis" id={h.id} href={safeEntityHref("hypothesis", h.id)} style={{ display: "flex", textDecoration: "none", minWidth: 0 }}>
              <PreviewLinkTitle fontSize={14} color={theme.tx1}>{h.name}</PreviewLinkTitle>
            </PreviewLink>
            <MaturityBar total={h.lab_total} threshold={h.next_threshold} nextLevel={h.next_level} titleKey="labSignal.title" showReady={false}>
              {personal && (
                <div data-testid="lab-signal-personal" style={{ fontSize: 12, color: ink.label, lineHeight: 1.5 }}>
                  {t("labSignal.hypSignal", { total: f2(h.total_signal as number),
                    parts: t("maturityProgress.parts", { pred: f2(h.pred_signal ?? 0), obs: f2(h.obs_signal ?? 0), lab: f2(foreign) }) })}
                </div>
              )}
            </MaturityBar>
            {h.contributions.length === 0
              ? <div style={{ fontSize: 12, color: ink.muted }}>{t("labSignal.noContributions")}</div>
              : h.contributions.map(c => <Row key={`${c.type}-${c.id}`} c={c} />)}
            {Math.abs(h.rest) > 0.005 && <div data-testid="lab-signal-rest" style={{ fontSize: 11.5, color: ink.muted }}>{t("labSignal.rest", { n: f2(h.rest) })}</div>}
          </section>
        )
      })}
    </div>
  )
}
