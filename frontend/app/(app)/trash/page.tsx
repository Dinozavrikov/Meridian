"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { RotateCcw, Trash2 } from "lucide-react"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useT } from "@/lib/i18n/useT"
import { trashApi } from "@/lib/api"
import { typeColor, v2 } from "@/lib/theme"
import { DateStamp } from "@/components/ui/date-stamp"

type TrashItem = {
  entity_type: string
  id: number
  title: string
  deleted_at: string
  visibility: string
  lab_id: number | null
  status: string | null
}

// entity_type -> ключ query, которым каждая страница-список инвалидирует свои данные
const LIST_QUERY_KEY: Record<string, string> = {
  observation: "observations", hypothesis: "hypotheses", prediction: "predictions",
  worldview: "worldview", question: "questions", task: "tasks",
}

const TYPE_LABEL_KEY: Record<string, string> = {
  observation: "nav.data.observations", hypothesis: "nav.data.hypotheses",
  prediction: "nav.data.predictions", worldview: "nav.data.worldview",
  question: "nav.data.questions", task: "nav.analysis.tasks",
}

const TYPES = Object.keys(TYPE_LABEL_KEY)

export default function TrashPage() {
  const t = useT()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<string | null>(null)

  const { data, isLoading } = useQuery<TrashItem[]>({
    queryKey: ["trash", filter],
    queryFn: () => trashApi.list(filter ?? undefined),
  })

  const invalidateAfter = (entityType: string) => {
    qc.invalidateQueries({ queryKey: ["trash"] })
    qc.invalidateQueries({ queryKey: [LIST_QUERY_KEY[entityType] ?? entityType] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const restore = useMutation({
    mutationFn: (item: TrashItem) => trashApi.restore(item.entity_type, item.id),
    onSuccess: (_d, item) => invalidateAfter(item.entity_type),
  })

  const purge = useMutation({
    mutationFn: (item: TrashItem) => trashApi.purge(item.entity_type, item.id),
    onSuccess: (_d, item) => invalidateAfter(item.entity_type),
  })

  const handlePurge = async (item: TrashItem) => {
    const text = item.entity_type === "prediction" ? t("trash.purgeConfirmPrediction") : t("trash.purgeConfirm")
    if (await askConfirmText(text)) purge.mutate(item)
  }

  const items = data ?? []

  return (
    <PageShell>
      <Header titleKey="page.trash.title" />
      <PageContent>
        <p style={{ fontSize: 12, color: v2.t3, lineHeight: 1.6, marginBottom: 16 }}>
          {t("trash.subtitle")}
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          <FilterPill active={filter === null} onClick={() => setFilter(null)} label={t("trash.filterAll")} />
          {TYPES.map(type => (
            <FilterPill key={type} active={filter === type} onClick={() => setFilter(type)} label={t(TYPE_LABEL_KEY[type])} />
          ))}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: 56, borderRadius: 10, background: v2.surf2, border: `0.5px solid ${v2.bd}`, opacity: 0.5 - i * 0.08 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: v2.t3, fontSize: 13 }}>
            {t("trash.empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => (
              <div key={`${item.entity_type}-${item.id}`} style={{
                display: "flex", alignItems: "center", gap: 12,
                background: v2.surf, border: `0.5px solid ${v2.bd}`, borderRadius: 10,
                padding: "10px 14px", borderLeft: `3px solid ${typeColor[item.entity_type] ?? v2.t3}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: v2.t3, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                    {t(TYPE_LABEL_KEY[item.entity_type] ?? item.entity_type)}
                  </div>
                  <div style={{ fontSize: 13.5, color: v2.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title || `#${item.id}`}
                  </div>
                  <div style={{ fontSize: 10.5, color: v2.t3, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {t("trash.deletedAt")} <DateStamp raw={item.deleted_at} />
                  </div>
                </div>
                <button onClick={() => restore.mutate(item)} disabled={restore.isPending} title={t("trash.restore")} style={iconBtn(v2.teal)}>
                  <RotateCcw size={14} />
                </button>
                <button onClick={() => handlePurge(item)} disabled={purge.isPending} title={t("trash.purge")} style={iconBtn(v2.red)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PageContent>
    </PageShell>
  )
}

function iconBtn(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${v2.bd}`,
    background: "transparent", color, cursor: "pointer", flexShrink: 0,
  }
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11.5, padding: "5px 12px", borderRadius: 20,
      border: `0.5px solid ${active ? v2.teal : v2.bd}`,
      background: active ? "rgba(77,207,166,0.1)" : "transparent",
      color: active ? v2.teal : v2.t3, cursor: "pointer",
    }}>
      {label}
    </button>
  )
}
