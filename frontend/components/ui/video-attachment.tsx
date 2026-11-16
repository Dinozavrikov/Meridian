"use client"
import React, { useState } from "react"
import { X, Play } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

export function VideoAttachment({ ytId, viId, accent, maxWidth = 320, collapsedMaxWidth = 240 }: { ytId?: string | null; viId?: string | null; accent: string; maxWidth?: number; collapsedMaxWidth?: number }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const isYT = !!ytId
  const embedSrc = isYT ? `https://www.youtube.com/embed/${ytId}?autoplay=1` : `https://player.vimeo.com/video/${viId}?autoplay=1`
  const platformColor = isYT ? "#FF4444" : "#1ab7ea"
  const platformLabel = isYT ? "YouTube" : "Vimeo"
  if (expanded) return (
    <div style={{ marginTop: 8, width: maxWidth, maxWidth: "100%" }}>
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden", background: "#000" }}>
        <iframe src={embedSrc} referrerPolicy="strict-origin-when-cross-origin" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
      <button onClick={() => setExpanded(false)} style={{ marginTop: 5, fontSize: 10, color: "#88889b", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}><X size={9} /> {t("notes.collapse")}</button>
    </div>
  )
  return (
    <div onClick={() => setExpanded(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 0, marginTop: 6, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", maxWidth: collapsedMaxWidth, transition: "border-color 0.15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = accent + "40"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"}>
      <div style={{ width: 56, height: 36, flexShrink: 0, position: "relative", background: "#0a0a14", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", background: "#0d0d1c" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: platformColor, display: "flex", alignItems: "center", justifyContent: "center" }}><Play size={8} color="#fff" fill="#fff" /></div>
        </div>
      </div>
      <div style={{ flex: 1, padding: "5px 9px", minWidth: 0 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", color: platformColor }}>{platformLabel}</div>
        <div style={{ fontSize: 9.5, color: "#88889b", marginTop: 1 }}>{t("notes.clickToWatch")}</div>
      </div>
    </div>
  )
}
