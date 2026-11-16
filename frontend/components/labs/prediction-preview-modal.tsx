"use client"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { v2 } from "@/lib/theme"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface PredictionPreviewModalProps {
  pred: any | null
  onClose: () => void
}

export function PredictionPreviewModal({ pred, onClose }: PredictionPreviewModalProps) {
  const t = useT()
  if (!pred) return null
  return (
    <Modal open={!!pred} onClose={onClose} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <StatusBadge status={pred.status} fontSize={10} />
          {pred.expected_check_date && (
            <span style={{ fontSize: 11, color: v2.t3, fontFamily: "'JetBrains Mono', monospace" }}>
              {t("predictions.checkDateLabel")}: {new Date(pred.expected_check_date).toLocaleDateString()}
            </span>
          )}
        </div>
        {pred.title && <h2 style={{ fontSize: 18, fontWeight: 700, color: v2.t1, lineHeight: 1.4, margin: "0 0 14px" }}>{pred.title}</h2>}
        <p style={{ fontSize: 13.5, color: v2.t2, lineHeight: 1.75, margin: "0 0 16px", maxWidth: 560, whiteSpace: "pre-wrap" }}>
          {pred.text}
        </p>
        {pred.hyp_name && (
          <div style={{ fontSize: 12, color: v2.t3, marginBottom: 8 }}>
            {t("predictions.hypothesisLabel")}: {pred.hyp_name}
          </div>
        )}
        {pred.confidence != null && (
          <div style={{ fontSize: 12, color: v2.t3, marginBottom: 20 }}>
            {t("predictions.confidenceLabel")}: {pred.confidence}%
          </div>
        )}
        {pred.result_notes && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: v2.bg, border: `1px solid ${v2.bd}`, marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: v2.t3, textTransform: "uppercase", marginBottom: 4 }}>{t("predictions.resultLabel")}</div>
            <div style={{ fontSize: 13, color: v2.t2 }}>{pred.result_notes}</div>
          </div>
        )}
        <Link href={`/predictions?id=${pred.slug || pred.id}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            marginTop: 10, padding: "10px 16px", borderRadius: 9, textDecoration: "none",
            background: "#3498DB14", color: "#3498DB",
            border: "1px solid #3498DB30", fontSize: 12.5, fontWeight: 600,
          }}>
          {t("labPreview.openFull")} <ExternalLink size={13} />
        </Link>
      </div>
    </Modal>
  )
}
