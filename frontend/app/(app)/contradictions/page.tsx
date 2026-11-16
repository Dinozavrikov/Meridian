"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, X } from "lucide-react"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { useContradictionsPending } from "@/lib/use-contradictions-pending"
import { contradictionApi } from "@/lib/contradiction-api"
import { entityHref } from "@/lib/entity-routes"
import { PreviewLink } from "@/components/entities/preview-link"

/**
 * Полный список pending-находок — не дублирует логику ContradictionsBell
 * дословно, но использует тот же хук/API. Дропдаун в хедере ограничен
 * DROPDOWN_LIMIT и ссылается сюда через "Показать все".
 */
export default function ContradictionsPage() {
  const t = useT()
  const qc = useQueryClient()
  const { items, count } = useContradictionsPending()
  const dt = useDynamicTranslate(items.map(i => i.relation))

  const setVerdict = useMutation({
    mutationFn: ({ feedbackId, verdict }: { feedbackId: number; verdict: "accepted" | "rejected" }) =>
      contradictionApi.setVerdict(feedbackId, verdict),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contradictions-pending"] }),
  })

  return (
    <PageShell>
      <Header titleKey="contradictionsPage.title" color="#F5A623" icon={<AlertTriangle size={16} style={{ color: "#F5A623" }} />} />
      <PageContent>
        {count === 0 && (
          <div style={{ fontSize: 13, color: "#9999ad", padding: 20 }}>
            {t("contradictionsPage.empty")}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 20, maxWidth: 640 }}>
          {items.map(item => (
            <div key={item.feedback_id} style={{
              display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px",
              borderRadius: 10, background: "#F5A62310", border: "1px solid #F5A62330",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#F5A623", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {dt(item.relation)}
                </span>
                <span style={{ fontSize: 11, color: "#9696aa", marginLeft: "auto" }}>{item.confidence}%</span>
              </div>
              <PreviewLink type={item.source_entity_type} id={item.source_entity_id} href={entityHref(item.source_entity_type, item.source_entity_id)} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 13, color: "#9090b8", lineHeight: 1.5 }}>«{item.new_quote}»</div>
              </PreviewLink>
              <PreviewLink type={item.entity_type} id={item.entity_id} href={entityHref(item.entity_type, item.entity_id)} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 13, color: "#9797af", lineHeight: 1.5 }}>«{item.existing_quote}»</div>
              </PreviewLink>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "accepted" })}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid #242430", background: "transparent", color: "#9999ad", cursor: "pointer" }}>
                  <Check size={12} /> {t("contradictionNudge.accept")}
                </button>
                <button onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "rejected" })}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid #242430", background: "transparent", color: "#9999ad", cursor: "pointer" }}>
                  <X size={12} /> {t("contradictionNudge.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </PageContent>
    </PageShell>
  )
}
