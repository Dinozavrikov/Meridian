"use client"
// "Результаты" — синтезированные документы лабы (сущность Result, не
// Prediction — см. ТЗ п.11/п.24 и docstring модели Result). Список карточек
// + создание + детальный просмотр с suggestion/diff/publish в модалке.
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, FileText, Lock, Users, Globe2 } from "lucide-react"
import { resultApi, imageApi, resolveMediaUrl } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"
import { Modal } from "@/components/ui/modal"
import { ResultForm } from "@/components/entities/result-form"
import { ResultDetailModal } from "@/components/labs/result-detail-modal"
import { v2 } from "@/lib/theme"
import { stripHtml } from "@/lib/strip-html"
import { useT } from "@/lib/i18n/useT"
import { invalidateLabCard } from "@/lib/lab-queries"

export function LabResultsTab({ labId, canManage, isMember, bare, labIsPublic }: {
  labId: number; canManage: boolean; isMember: boolean; bare?: boolean; labIsPublic: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [openResultId, setOpenResultId] = useState<number | null>(null)

  const { data = [], isLoading } = useTranslatedListQuery(
    ["results", "lab", labId],
    () => resultApi.list({ lab_id: labId }),
    "result",
    ["title", "body"],
  )

  const create = useMutation({
    mutationFn: async ({ body, pendingFiles, selectedSourceIds }: { body: any; pendingFiles: Map<string, File>; selectedSourceIds?: Set<number> }) => {
      const created = await resultApi.create({ ...body, lab_id: labId })
      if (pendingFiles && pendingFiles.size > 0) {
        let newBody = created.body
        for (const [blobUrl, file] of pendingFiles) {
          const uploaded = await imageApi.upload("result", created.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) newBody = newBody.split(blobUrl).join(url)
          URL.revokeObjectURL(blobUrl)
        }
        if (newBody !== created.body) {
          await resultApi.update(created.id, { title: created.title, body: newBody, visibility: created.visibility })
        }
      }
      if (selectedSourceIds && selectedSourceIds.size > 0) {
        for (const sourceId of selectedSourceIds) {
          await resultApi.linkSource(created.id, sourceId)
        }
      }
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results", "lab", labId] })
      invalidateLabCard(qc, labId)  // бейдж "Результаты N" живёт в карточке лаборатории
      setShowCreateModal(false)
    },
  })

  return (
    <div className={bare ? "" : "p-5"}>
      {isLoading ? (
        <div style={{ color: v2.t3, fontSize: 12 }}>…</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: v2.t3, fontSize: 12 }}>
          {t("labTabs.resultsEmpty")}
        </div>
      ) : (
        <div className={bare ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
          {data.map((r: any) => (
            <div key={r.id} onClick={() => setOpenResultId(r.id)}
              style={{ padding: "12px 14px", borderRadius: 10, background: v2.surf, border: `1px solid ${v2.bd}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span title={t("results.cardTypeLabel")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 6, background: "#4A90D920",
                }}>
                  <FileText size={13} style={{ color: "#4A90D9" }} />
                </span>
                <span title={r.visibility === "private" ? t("visibility.private") : t("visibility.lab")} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 6, background: `${v2.t3}20`,
                }}>
                  {r.visibility === "private" ? (
                    <Lock size={13} style={{ color: v2.t3 }} />
                  ) : (
                    <Users size={13} style={{ color: v2.t3 }} />
                  )}
                </span>
                {r.is_published && labIsPublic && (
                  <span title={t("results.published")} style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: 6, background: "#2ECC7120",
                  }}>
                    <Globe2 size={13} style={{ color: "#2ECC71" }} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: v2.t1, marginBottom: 6, fontWeight: 500 }}>
                {r.title}
              </div>
              {r.body && (
                <div style={{ fontSize: 11.5, color: v2.t3, lineHeight: 1.5 }}>{stripHtml(r.body).slice(0, bare ? 60 : 100)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {isMember && (
        <button onClick={() => setShowCreateModal(true)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: 10, borderRadius: 10, cursor: "pointer", marginTop: 12,
            background: "transparent", border: "1px dashed #4A90D960", color: "#4A90D9",
            fontSize: 11.5, fontWeight: 600,
          }}>
          <Plus size={13} /> {t("results.create")}
        </button>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={t("results.create")} size="lg">
        <ResultForm onSave={(body: any, pendingFiles: Map<string, File>, selectedSourceIds: Set<number>) => create.mutateAsync({ body, pendingFiles, selectedSourceIds })} onCancel={() => setShowCreateModal(false)} labIsPublic={labIsPublic} labId={labId} />
      </Modal>

      <ResultDetailModal resultId={openResultId} onClose={() => setOpenResultId(null)} canManage={canManage} isMember={isMember} labIsPublic={labIsPublic} />
    </div>
  )
}
