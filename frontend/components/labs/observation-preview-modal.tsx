"use client"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { v2 } from "@/lib/theme"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface ObservationPreviewModalProps {
  obs: any | null
  onClose: () => void
}

export function ObservationPreviewModal({ obs, onClose }: ObservationPreviewModalProps) {
  const t = useT()
  if (!obs) return null
  return (
    <Modal open={!!obs} onClose={onClose} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <StatusBadge status={obs.status} fontSize={10} />
          {obs.date && <span style={{ fontSize: 11, color: v2.t3, fontFamily: "'JetBrains Mono', monospace" }}>{obs.date}</span>}
        </div>
        {obs.title && <h2 style={{ fontSize: 18, fontWeight: 700, color: v2.t1, lineHeight: 1.4, margin: "0 0 14px" }}>{obs.title}</h2>}
        <p style={{ fontSize: 13.5, color: v2.t2, lineHeight: 1.75, margin: "0 0 20px", maxWidth: 560, whiteSpace: "pre-wrap" }}>
          {obs.text}
        </p>
        {obs.author && (
          <div style={{ fontSize: 11, color: v2.t3, marginBottom: 20 }}>{obs.author}</div>
        )}
        <Link href={`/observations?id=${obs.slug || obs.id}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            marginTop: 10, padding: "10px 16px", borderRadius: 9, textDecoration: "none",
            background: "#1ABC9C14", color: "#1ABC9C",
            border: "1px solid #1ABC9C30", fontSize: 12.5, fontWeight: 600,
          }}>
          {t("labPreview.openFull")} <ExternalLink size={13} />
        </Link>
      </div>
    </Modal>
  )
}
