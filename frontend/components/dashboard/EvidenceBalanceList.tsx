"use client"
import Link from "next/link"
import { v2 } from "@/lib/theme"
import { Card, Label, EmptyState } from "./primitives"
import { Scale } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { PreviewLink } from "@/components/entities/preview-link"
import { safeEntityHref } from "@/lib/entity-routes"

export interface EvidenceRow {
  id: number
  name: string
  conf: number
  ref: number
  score: number
}

function BalanceWidget({ conf, ref: refVal }: { conf: number; ref: number }) {
  const maxSide = Math.max(conf, refVal, 1)
  const angle = Math.max(-20, Math.min(20, (refVal - conf) * 4))
  const panLeft  = Math.max(6, Math.min(16, 6 + (conf   / maxSide) * 10))
  const panRight = Math.max(6, Math.min(16, 6 + (refVal / maxSide) * 10))

  return (
    <div style={{ width: 72, height: 30, position: "relative", flexShrink: 0 }}>
      <div style={{
        position: "absolute", left: "50%", bottom: 2, transform: "translateX(-50%)",
        width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
        borderBottom: `8px solid ${v2.bd2}`,
      }} />
      <div style={{
        position: "absolute", left: 6, right: 6, top: 14, height: 2, background: v2.bd2,
        borderRadius: 2, transformOrigin: "center center", transform: `rotate(${angle}deg)`,
        transition: "transform 0.3s ease",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: 0, width: panLeft, height: panLeft,
          borderRadius: 3, background: v2.teal, transform: "translate(-50%,-50%)",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "100%", width: panRight, height: panRight,
          borderRadius: 3, background: v2.red, transform: "translate(-50%,-50%)",
        }} />
      </div>
    </div>
  )
}

export function EvidenceBalanceList({ rows }: { rows: EvidenceRow[] }) {
  const t = useT()
  return (
    <Card>
      {!rows.length ? (
        <EmptyState
          icon={<Scale size={15} />}
          title={t("dashboard.evidence.empty.title")}
          actionLabel={t("dashboard.evidence.empty.action")}
          actionHref="/hypotheses"
        />
      ) : (
        <div>
          {rows.slice(0, 6).map(r => (
            <PreviewLink key={r.id} type="hypothesis" id={r.id} href={safeEntityHref("hypothesis", r.id)} style={{ textDecoration: "none", display: "block" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) 72px 40px",
                alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `0.5px solid ${v2.bd}`,
              }}>
                <div style={{ fontSize: 12.5, color: v2.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {r.name}
                </div>
                <BalanceWidget conf={r.conf} ref={r.ref} />
                <div style={{
                  fontFamily: v2.fontMono, fontSize: 12, textAlign: "right",
                  color: r.score > 0 ? v2.teal : r.score < 0 ? v2.red : v2.t3,
                }}>
                  {r.score > 0 ? "+" : ""}{r.score}
                </div>
              </div>
            </PreviewLink>
          ))}
          {rows.length > 6 && (
            <Link href="/hypotheses" style={{ textDecoration: "none" }}>
              <div style={{ fontSize: 10, color: v2.t3, padding: "8px 0 0", textAlign: "right" }}>
                {t("dashboard.evidence.showAll", { count: rows.length })}
              </div>
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}
