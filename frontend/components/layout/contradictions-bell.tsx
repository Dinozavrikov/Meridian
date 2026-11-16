"use client"
import { useState, useRef, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { AlertTriangle, Check, X } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { useContradictionsPending } from "@/lib/use-contradictions-pending"
import { contradictionApi } from "@/lib/contradiction-api"
import { entityHref } from "@/lib/entity-routes"
import { PreviewLink } from "@/components/entities/preview-link"
import { v2 } from "@/lib/theme"

const DROPDOWN_LIMIT = 5

/**
 * Глобальный значок в хедере (видим на любой странице) — счётчик
 * несмотренных находок из ручных и фоновых проверок противоречий
 * (contradiction_feedback, verdict='pending'). Тот же паттерн поллинга,
 * что unread-сообщения/комментарии. Дропдаун позволяет разобрать
 * несколько находок на месте, не уходя со страницы — решение принимается
 * быстро (два клика), а не требует полного перехода на отдельный экран.
 */
export function ContradictionsBell() {
  const t = useT()
  const qc = useQueryClient()
  const { items, count } = useContradictionsPending()
  const dt = useDynamicTranslate(items.map(i => i.relation))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const setVerdict = useMutation({
    mutationFn: ({ feedbackId, verdict }: { feedbackId: number; verdict: "accepted" | "rejected" }) =>
      contradictionApi.setVerdict(feedbackId, verdict),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contradictions-pending"] }),
  })

  if (count === 0) {
    return null  // нечего показывать — не занимаем место в хедере впустую
  }

  const visible = items.slice(0, DROPDOWN_LIMIT)

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t("contradictionsBell.label")}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8,
          background: open ? "#F5A623" : "#F5A62312", border: "1px solid #F5A62330",
          color: open ? "#0b0d14" : "#F5A623", cursor: "pointer", transition: "all 0.12s",
        }}
      >
        <AlertTriangle size={13} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{count}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 380, maxHeight: 480,
          overflowY: "auto", background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)", zIndex: 50, padding: 10,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 12, color: "#9999ad", fontWeight: 600, padding: "2px 4px" }}>
            {t("contradictionsBell.title")}
          </div>
          {visible.map(item => (
            <div key={item.feedback_id} style={{
              display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px",
              borderRadius: 8, background: "#F5A62310", border: "1px solid #F5A62330",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#F5A623", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {dt(item.relation)}
                </span>
                <span style={{ fontSize: 10, color: "#9696aa", marginLeft: "auto" }}>{item.confidence}%</span>
              </div>
              <PreviewLink type={item.source_entity_type} id={item.source_entity_id} href={entityHref(item.source_entity_type, item.source_entity_id)} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 12, color: "#9090b8", lineHeight: 1.4 }}>«{item.new_quote}»</div>
              </PreviewLink>
              <PreviewLink type={item.entity_type} id={item.entity_id} href={entityHref(item.entity_type, item.entity_id)} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 12, color: "#9797af", lineHeight: 1.4 }}>«{item.existing_quote}»</div>
              </PreviewLink>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "accepted" })}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #242430", background: "transparent", color: "#9999ad", cursor: "pointer" }}>
                  <Check size={11} /> {t("contradictionNudge.accept")}
                </button>
                <button onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "rejected" })}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #242430", background: "transparent", color: "#9999ad", cursor: "pointer" }}>
                  <X size={11} /> {t("contradictionNudge.reject")}
                </button>
              </div>
            </div>
          ))}
          {count > DROPDOWN_LIMIT && (
            <Link href="/contradictions" style={{ textDecoration: "none" }}>
              <div style={{ fontSize: 12, color: "#F5A623", textAlign: "center", padding: "6px 0" }}>
                {t("contradictionsBell.showAll")}
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
