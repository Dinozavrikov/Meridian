"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { predApi } from "@/lib/api"
import { getUrgency, daysLeft, URGENCY_COLOR } from "@/lib/prediction-urgency"
import { ConfirmPredictionModal, type ConfirmPredictionTarget } from "./confirm-prediction-modal"
import { Clock, Wrench } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

export interface QueueItem {
  id: number
  title?: string
  text?: string
  status?: string
  expected_check_date?: string
  hyp_name?: string | null
  hypothesis_id?: number | null
  is_onboarding?: boolean
  confidence?: number | null
  confirms_hypothesis_if_true?: boolean
}

interface PredictionQueueProps {
  items: QueueItem[]
  invalidateKeys?: any[][]
  compact?: boolean
  showHeader?: boolean
  bordered?: boolean
  onNavigate?: () => void
}

function QueueRow({ p, onOpen, t, onNavigate }: { p: QueueItem; onOpen: (p: QueueItem) => void; t: (key: string, vars?: Record<string, string | number>) => string; onNavigate?: () => void }) {
  const urg = getUrgency({ status: p.status ?? "не проверен", expected_check_date: p.expected_check_date })
  const dl = daysLeft(p)
  const color = URGENCY_COLOR[urg]
  const isOverdue = urg === "overdue"

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 18px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        width: 62, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1, whiteSpace: "nowrap" }}>
          {dl != null ? Math.abs(dl) : "—"}
          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>{t("queue.row.days")}</span>
        </span>
        <span style={{ fontSize: 8, color: `${color}b0`, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 3, whiteSpace: "nowrap" }}>
          {isOverdue ? t("queue.row.overdue") : t("queue.row.remaining")}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#f2efe9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.title || p.text?.slice(0, 80)}
        </div>
        {p.hyp_name && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, overflow: "hidden" }}>
            <span style={{ fontSize: 11, color: "rgba(242,239,233,0.4)", flexShrink: 0, whiteSpace: "nowrap" }}>{t("queue.row.byHypothesis")}</span>
            {p.hypothesis_id ? (
              <Link href="/hypotheses" style={{ fontSize: 11, color: "#4A90D9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {p.hyp_name}
              </Link>
            ) : (
              <span style={{ fontSize: 11, color: "rgba(242,239,233,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {p.hyp_name}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onOpen(p)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7,
            fontSize: 11.5, fontWeight: 600, cursor: "pointer",
            background: `${color}14`, color, border: `1px solid ${color}35`,
          }}>
          <Wrench size={12} /> {t("queue.row.resolve")}
        </button>
        <Link href={`/predictions?id=${p.id}&tab=detail`} onClick={onNavigate}
          style={{ display: "flex", alignItems: "center", padding: "7px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
            background: "#161928", color: "rgba(242,239,233,0.5)", border: "1px solid rgba(255,255,255,0.13)", textDecoration: "none" }}>
          {t("queue.row.open")}
        </Link>
      </div>
    </div>
  )
}

function QueueGroup({ label, color, items, onOpen, t, onNavigate }: { label: string; color: string; items: QueueItem[]; onOpen: (p: QueueItem) => void; t: (key: string, vars?: Record<string, string | number>) => string; onNavigate?: () => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 18px 6px",
        background: `${color}08`,
      }}>
        <div style={{ width: 3, height: 11, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color, opacity: 0.7 }}>{items.length}</span>
      </div>
      {items.map(p => <QueueRow key={p.id} p={p} onOpen={onOpen} t={t} onNavigate={onNavigate} />)}
    </div>
  )
}

export function PredictionQueue({ items, invalidateKeys = [["predictions"]], compact = false, showHeader = true, bordered = true, onNavigate }: PredictionQueueProps) {
  const t = useT()
  const qc = useQueryClient()
  const [target, setTarget] = useState<ConfirmPredictionTarget | null>(null)

  const close = useMutation({
    mutationFn: ({ id, status, result_notes }: { id: number; status: string; result_notes: string }) =>
      predApi.close(id, status, result_notes),
    onSuccess: () => {
      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }))
      setTarget(null)
    },
  })

  const withUrgency = items.map(p => ({ p, urg: getUrgency({ status: p.status ?? "не проверен", expected_check_date: p.expected_check_date }) }))
  const overdue = withUrgency.filter(x => x.urg === "overdue").map(x => x.p).sort((a, b) => (daysLeft(b) ?? 0) - (daysLeft(a) ?? 0))
  const soon = withUrgency.filter(x => x.urg === "soon").map(x => x.p).sort((a, b) => (daysLeft(a) ?? 9999) - (daysLeft(b) ?? 9999))
  const total = overdue.length + soon.length

  if (total === 0) return null

  const accentColor = overdue.length > 0 ? "#E74C3C" : "#F5A623"

  const content = (
    <>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 10px" }}>
          <Clock size={15} style={{ color: accentColor, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f2efe9" }}>{t("queue.modal.title")}</span>
          <span style={{ fontSize: 11, color: "rgba(242,239,233,0.4)", marginLeft: "auto" }}>{t("queue.modal.count", { n: total })}</span>
        </div>
      )}
      <QueueGroup label={t("queue.group.overdue")} color="#E74C3C" items={overdue} onOpen={setTarget} t={t} onNavigate={onNavigate} />
      <QueueGroup label={t("queue.group.soon")} color="#F5A623" items={soon} onOpen={setTarget} t={t} onNavigate={onNavigate} />
    </>
  )

  return (
    <>
      {bordered ? (
        <div style={{
          borderRadius: 14, overflow: "hidden",
          border: `1px solid ${accentColor}48`,
          background: `linear-gradient(180deg, ${accentColor}0f, transparent 30%)`,
          marginBottom: compact ? 0 : 24,
        }}>
          {content}
        </div>
      ) : (
        <div style={{ margin: "-32px", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
          {content}
        </div>
      )}

      <ConfirmPredictionModal
        target={target}
        onClose={() => setTarget(null)}
        isPending={close.isPending}
        onSave={(status, notes) => target ? close.mutateAsync({ id: target.id, status, result_notes: notes }) : Promise.resolve()}
      />
    </>
  )
}
