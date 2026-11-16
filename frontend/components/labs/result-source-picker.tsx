"use client"
// Прикрепление к Result уже существующего источника из этой же лабы —
// не пересоздание/скрейпинг заново (см. решение с Алексеем: только источники,
// уже прикреплённые к другим сущностям лабы, "чистая связь" — ResultSourceLink,
// не копия данных).
// Два режима:
//  - resultId задан: результат уже существует, выбор сразу линкует через API
//    (как было изначально).
//  - resultId не задан, labId задан: результат ещё не создан (форма создания),
//    выбор только копится локально в selectedIds/onToggleSelect, реальная
//    линковка отложена до появления result.id (тот же паттерн, что у
//    pendingFiles для картинок в ResultRichEditor).
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Link2, ExternalLink, Check } from "lucide-react"
import { resultApi } from "@/lib/api"
import { Modal } from "@/components/ui/modal"
import { v2 } from "@/lib/theme"
import { TYPE_RU } from "@/lib/utils"
import { useT } from "@/lib/i18n/useT"
import { useListContentTranslation } from "@/lib/i18n/useContentT"

export function ResultSourcePicker({ resultId, labId, open, onClose, selectedIds, onToggleSelect }: {
  resultId?: number; labId?: number; open: boolean; onClose: () => void
  selectedIds?: Set<number>; onToggleSelect?: (sourceId: number) => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const preCreate = !resultId

  const { data: available = [], isLoading } = useQuery({
    queryKey: preCreate ? ["labs", labId, "sources", "available"] : ["results", resultId, "sources", "available"],
    queryFn: () => preCreate ? resultApi.listAvailableSourcesByLab(labId as number) : resultApi.listAvailableSources(resultId as number),
    enabled: open && (preCreate ? labId != null : resultId != null),
  })

  const link = useMutation({
    mutationFn: (sourceDocumentId: number) => resultApi.linkSource(resultId as number, sourceDocumentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results", resultId, "sources"] })
    },
  })

  // origin.entity_name (название сущности-носителя) НЕ переводим здесь —
  // у него нет своего is_own в ResultSourceOriginOut, а автор источника и
  // автор сущности-носителя могут быть разными людьми. См. обсуждение с
  // Алексей — сознательно отложено, source.title переводим, entity_name нет.
  const tSource = useListContentTranslation(
    "source_document", available.map((a: any) => a.source), ["title"],
    (src: any) => !!available.find((a: any) => a.source.id === src.id)?.is_own,
  )

  const filtered = available.filter((a: any) =>
    !q.trim() || a.source.title.toLowerCase().includes(q.toLowerCase()) || a.origin.entity_name.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <Modal open={open} onClose={onClose} title={t("results.sourcesPickerTitle")} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", border: `1px solid ${v2.bd2}`, borderRadius: 8 }}>
          <Search size={13} style={{ color: v2.t3 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("results.sourcesPickerSearch")}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: v2.t1 }} />
        </div>

        {isLoading ? (
          <div style={{ color: v2.t3, fontSize: 12, textAlign: "center", padding: "20px 0" }}>…</div>
        ) : available.length === 0 ? (
          <div style={{ color: v2.t3, fontSize: 12.5, textAlign: "center", padding: "28px 10px", lineHeight: 1.6 }}>
            {t("results.sourcesPickerEmpty")}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: v2.t3, fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            {t("results.sourcesPickerNoMatch")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {filtered.map((a: any) => {
              const isSelected = preCreate ? (selectedIds?.has(a.source.id) ?? false) : a.already_linked
              const disabled = preCreate ? false : (a.already_linked || link.isPending)
              const handleClick = () => {
                if (preCreate) onToggleSelect?.(a.source.id)
                else link.mutate(a.source.id)
              }
              return (
                <div key={a.source.id}
                  style={{
                    padding: "10px 12px", borderRadius: 8, border: `1px solid ${v2.bd}`,
                    background: v2.bg, display: "flex", flexDirection: "column", gap: 5,
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 12.5, color: v2.t1, fontWeight: 500, lineHeight: 1.4 }}>{tSource(a.source, "title", a.source.title) || a.source.url}</div>
                    <a href={a.source.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ color: v2.t3, flexShrink: 0, display: "flex" }}>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div style={{ fontSize: 10.5, color: v2.t3 }}>
                    {t("results.sourcesPickerFrom", { type: TYPE_RU[a.origin.entity_type] ?? a.origin.entity_type, name: a.origin.entity_name })}
                  </div>
                  <button type="button" onClick={handleClick}
                    disabled={disabled}
                    style={{
                      alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5,
                      fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 6, marginTop: 2,
                      border: `1px solid ${isSelected ? v2.bd : "#4A90D950"}`,
                      background: isSelected ? "transparent" : "#4A90D914",
                      color: isSelected ? v2.t3 : "#4A90D9",
                      cursor: disabled ? "default" : "pointer",
                    }}>
                    {isSelected ? <Check size={10} /> : <Link2 size={10} />}
                    {isSelected
                      ? (preCreate ? t("results.sourceSelected") : t("results.sourceAlreadyLinked"))
                      : (preCreate ? t("results.sourceSelect") : t("results.sourceAttach"))}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
