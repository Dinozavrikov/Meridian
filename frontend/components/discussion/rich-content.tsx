"use client"
import { useState } from "react"
import { X, Play } from "lucide-react"
import { getYouTubeId, getVimeoId, isImageUrl } from "@/lib/embed-utils"
import { resolveMediaUrl } from "@/lib/api"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"

function VideoEmbed({ ytId, viId }: { ytId?: string | null; viId?: string | null }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const isYT = !!ytId
  const embedSrc = isYT ? `https://www.youtube.com/embed/${ytId}?autoplay=1` : `https://player.vimeo.com/video/${viId}?autoplay=1`

  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        border: `1px solid ${theme.ln2}`, borderRadius: 8, overflow: "hidden", background: theme.bg2, maxWidth: 320, margin: "6px 0",
      }}>
        <div style={{ width: 72, height: 46, flexShrink: 0, background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Play size={14} color="#fff" fill="#fff" aria-hidden />
        </div>
        <span style={{ fontSize: 11, color: theme.tx3 }}>{t("discussion.videoOpen", { service: isYT ? "YouTube" : "Vimeo" })}</span>
      </div>
    )
  }
  return (
    <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, maxWidth: 400, margin: "6px 0", borderRadius: 8, overflow: "hidden", background: "#000" }}>
      <iframe src={embedSrc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
    </div>
  )
}

/** Лайтбокс с угловой «рамкой улики» — изображение в дискуссии подано как приложенное
 * доказательство к аргументу, рамка окрашена в цвет позиции (подтверждает/уточняет/опровергает). */
function EvidenceLightbox({ src, color, onClose }: { src: string; color: string; onClose: () => void }) {
  const t = useT()
  const corner = (top: boolean, left: boolean): React.CSSProperties => ({
    position: "absolute", width: 22, height: 22,
    [top ? "top" : "bottom"]: -10, [left ? "left" : "right"]: -10,
    borderTop: top ? `2px solid ${color}` : "none",
    borderBottom: !top ? `2px solid ${color}` : "none",
    borderLeft: left ? `2px solid ${color}` : "none",
    borderRight: !left ? `2px solid ${color}` : "none",
  } as React.CSSProperties)

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "rgba(6,8,14,0.86)", backdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, cursor: "zoom-out",
    }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(90vw, 720px)", maxHeight: "78vh" }}>
        <div style={corner(true, true)} /><div style={corner(true, false)} />
        <div style={corner(false, true)} /><div style={corner(false, false)} />
        <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "78vh", display: "block", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontFamily: theme.mono, fontSize: 11, color }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
        {t("discussion.attachedAsArgument")}
      </div>
      <button onClick={onClose} style={{
        position: "absolute", top: 24, right: 28, width: 34, height: 34, borderRadius: "50%",
        background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <X size={16} />
      </button>
    </div>
  )
}

export function RichContent({ text, stanceColor = "#8b91a8" }: { text: string; stanceColor?: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const lines = text.split("\n")
  return (
    <div>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} style={{ height: 4 }} />
        if (isImageUrl(trimmed)) {
          const resolved = resolveMediaUrl(trimmed) ?? trimmed
          return (
            <img key={i} src={resolved} alt="" onClick={() => setLightbox(resolved)}
              style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, margin: "6px 0", display: "block", cursor: "zoom-in", transition: "transform 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.02)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            />
          )
        }
        const yt = getYouTubeId(trimmed)
        if (yt) return <VideoEmbed key={i} ytId={yt} />
        const vi = getVimeoId(trimmed)
        if (vi) return <VideoEmbed key={i} viId={vi} />
        return <div key={i}>{line}</div>
      })}
      {lightbox && <EvidenceLightbox src={lightbox} color={stanceColor} onClose={() => setLightbox(null)} />}
    </div>
  )
}
