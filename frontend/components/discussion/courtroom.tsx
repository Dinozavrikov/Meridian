"use client"
import { useState } from "react"
import { Check, X, Link2 } from "lucide-react"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { CommentThread } from "./comment-thread"

export function Courtroom({ comments, onReply, currentUserId }: { comments: any[]; onReply: (c: any) => void; currentUserId?: number }) {
  const t = useT()
  const LANES = [
    { key: "confirm", label: t("courtroom.confirm"), color: "#27AE60", icon: Check },
    { key: "neutral", label: t("courtroom.neutral"), color: "#8b91a8", icon: Link2 },
    { key: "refute",  label: t("courtroom.refute"),  color: "#E74C3C", icon: X },
  ] as const

  const [filter, setFilter] = useState<string | null>(null)

  const visible = filter ? comments.filter(c => (c.stance ?? "neutral") === filter) : comments
  const counts = Object.fromEntries(LANES.map(l => [l.key, comments.filter(c => (c.stance ?? "neutral") === l.key).length]))

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        <button onClick={() => setFilter(null)} style={{
          fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 20, flexShrink: 0,
          border: `1px solid ${filter === null ? theme.tx1 : theme.ln2}`,
          background: filter === null ? "rgba(242,239,233,0.1)" : "transparent",
          color: filter === null ? theme.tx1 : theme.tx3,
        }}>{t("courtroom.all")} <span style={{ fontFamily: theme.mono, fontSize: 10, opacity: 0.6 }}>{comments.length}</span></button>
        {LANES.map(l => (
          <button key={l.key} onClick={() => setFilter(l.key)} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 20, flexShrink: 0,
            border: `1px solid ${filter === l.key ? l.color : theme.ln2}`,
            background: filter === l.key ? `${l.color}29` : "transparent",
            color: filter === l.key ? l.color : theme.tx3,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: l.color }} /> {l.label}
            <span style={{ fontFamily: theme.mono, fontSize: 10, opacity: 0.6 }}>{counts[l.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 12.5, color: theme.tx4, padding: "24px 0", textAlign: "center" }}>{t("courtroom.empty")}</div>
      ) : (
        visible.map(c => <CommentThread key={c.id} comment={c} onReply={onReply} currentUserId={currentUserId} />)
      )}
    </div>
  )
}
