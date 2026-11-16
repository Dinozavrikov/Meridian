"use client"
import { Modal } from "@/components/ui/modal"
import { Ruler } from "@/components/ui/ruler"
import { StatusBadge } from "@/components/ui/status-badge"
import { DEFAULT_SCALES } from "@/lib/scales"
import { v2 } from "@/lib/theme"
import { renderableHtml } from "@/lib/render-safe-html"
import { RichHtml } from "@/components/entities/rich-html"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

const MATURITY_SCALE  = DEFAULT_SCALES.find(s => s.id === "maturity"  && s.entity_type === "hypothesis")!
const STABILITY_SCALE = DEFAULT_SCALES.find(s => s.id === "stability" && s.entity_type === "hypothesis")!
const RISK_SCALE      = DEFAULT_SCALES.find(s => s.id === "risk"      && s.entity_type === "hypothesis")!

interface HypothesisPreviewModalProps {
  hyp: any | null
  onClose: () => void
}

export function HypothesisPreviewModal({ hyp, onClose }: HypothesisPreviewModalProps) {
  if (!hyp) return null

  const ScaleRow = ({ scale, value }: { scale: typeof MATURITY_SCALE; value: number }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: v2.t3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <span>{scale.name}</span><span style={{ color: scale.color }}>{value}/{scale.max}</span>
      </div>
      <Ruler variant="detail" name={scale.name} value={value} min={scale.min} max={scale.max} step={scale.step} levels={scale.levels} color={scale.color} />
    </div>
  )

  return (
    <Modal open={!!hyp} onClose={onClose} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <StatusBadge status={hyp.status} fontSize={10} />
          {hyp.date_created && <span style={{ fontSize: 11, color: v2.t3, fontFamily: "'JetBrains Mono', monospace" }}>{hyp.date_created}</span>}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: v2.t1, lineHeight: 1.4, margin: "0 0 14px" }}>{hyp.name}</h2>

        {hyp.description && (
          <RichHtml html={renderableHtml(hyp.description)} accent="#4A90D9" style={{ fontSize: 13.5, color: v2.t2, lineHeight: 1.75, margin: "0 0 26px", maxWidth: 560 }} />
        )}

        <ScaleRow scale={MATURITY_SCALE}  value={hyp.maturity ?? 0} />
        <ScaleRow scale={STABILITY_SCALE} value={hyp.stability ?? 0} />
        <ScaleRow scale={RISK_SCALE}      value={hyp.risk ?? 0} />

        <Link href={`/hypotheses?id=${hyp.id}&tab=detail`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            marginTop: 10, padding: "10px 16px", borderRadius: 9, textDecoration: "none",
            background: `${MATURITY_SCALE.color}14`, color: MATURITY_SCALE.color,
            border: `1px solid ${MATURITY_SCALE.color}30`, fontSize: 12.5, fontWeight: 600,
          }}>
          Открыть полностью <ExternalLink size={13} />
        </Link>
      </div>
    </Modal>
  )
}
