"use client"
import { v2 } from "@/lib/theme"
import { Card, Label, EmptyState } from "./primitives"
import { TrendingUp } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { PreviewLink } from "@/components/entities/preview-link"
import { safeEntityHref } from "@/lib/entity-routes"

export interface LedgerRow {
  id: number
  title: string
  status: string
  hyp_name: string
  check_date?: string
}

// Значения status — данные из бэкенда (как в OUTCOMES/confirm-prediction-modal.tsx),
// не UI-текст. STATUS_COLOR и STATUS_LABEL_KEY используют их как ключи маппинга.
const STATUS_COLOR: Record<string, string> = {
  "не проверен": v2.t3, "подтвердился": v2.teal,
  "не подтвердился": v2.red, "частично подтвердился": v2.amber,
}
const STATUS_LABEL_KEY: Record<string, string> = {
  "не проверен": "confirmPrediction.outcome.notChecked",
  "подтвердился": "confirmPrediction.outcome.confirmed",
  "не подтвердился": "confirmPrediction.outcome.refuted",
  "частично подтвердился": "confirmPrediction.outcome.partial",
}

export function PredictionLedger({ rows }: { rows: LedgerRow[] }) {
  const t = useT()
  return (
    <Card>
      {!rows.length ? (
        <EmptyState
          icon={<TrendingUp size={15} />}
          title={t("predictionLedger.emptyTitle")}
          actionLabel={t("predictionLedger.action")}
          actionHref="/predictions"
        />
      ) : (
        <div>
          {rows.slice(0, 6).map((r, i) => (
            <PreviewLink key={r.id} type="prediction" id={r.id} href={safeEntityHref("prediction", r.id)} style={{ textDecoration: "none", display: "block" }}>
              <div style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: `0.5px dashed ${v2.bd2}` }}>
                <div style={{ fontFamily: v2.fontMono, fontSize: 10, color: v2.t3, paddingTop: 2, width: 20, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: v2.t1, lineHeight: 1.4, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 10.5, color: v2.t3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: v2.violet }}>→ {r.hyp_name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap",
                      background: `${STATUS_COLOR[r.status] ?? v2.t3}22`, color: STATUS_COLOR[r.status] ?? v2.t3,
                    }}>{STATUS_LABEL_KEY[r.status] ? t(STATUS_LABEL_KEY[r.status]) : r.status}</span>
                  </div>
                </div>
              </div>
            </PreviewLink>
          ))}
        </div>
      )}
    </Card>
  )
}
