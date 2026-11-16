"use client"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { readableOn } from "@/lib/color"

export interface CompetitionRow { id: number; name: string; evidence_score: number }
const AMBER = "#F5A623"
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/** Ведущая назначена вручную, а по данным впереди другая: возвращает обе, иначе null. Строки приходят уже отсортированными по данным. */
export function leadLag(rows: CompetitionRow[], leadingId: number | null) {
  if (leadingId == null || rows.length === 0) return null
  const lead = rows.find(r => r.id === leadingId)
  const top = rows[0]
  if (!lead || top.id === leadingId || top.evidence_score <= lead.evidence_score) return null
  return { lead, top }
}

/** Предупреждение для конкурирующих гипотез вопроса или задачи; расчёты не меняет. */
export function CompetingLeadWarning({ parentType, parentId, leadingId }: { parentType: string; parentId: number; leadingId: number | null }) {
  const t = useT()
  const plural = parentType === "task" ? "tasks" : parentType === "question" ? "questions" : null
  const { data } = useQuery({
    queryKey: ["competition", parentType, parentId],
    queryFn: () => api.get(`/api/v1/${plural}/${parentId}/competition`).then(r => r.data as CompetitionRow[]),
    enabled: plural !== null && leadingId != null,
  })
  const lag = leadLag(data ?? [], leadingId)
  if (!lag) return null
  return (
    <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 10, fontSize: 12, lineHeight: 1.5,
      color: "#d6d9ec", background: `${AMBER}10`, border: `1px solid ${AMBER}44` }}>
      <AlertTriangle size={14} aria-hidden style={{ color: readableOn(AMBER), flexShrink: 0, marginTop: 2 }} />
      <span>{t("relations.leadLag", { top: lag.top.name, topScore: signed(lag.top.evidence_score), lead: lag.lead.name, leadScore: signed(lag.lead.evidence_score) })}</span>
    </div>
  )
}
