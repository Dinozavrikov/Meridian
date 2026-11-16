"use client"
import { useRef, useState } from "react"
import { Camera } from "lucide-react"
import { authApi, resolveMediaUrl } from "@/lib/api"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { apiErrorMessage } from "@/lib/api-error"

const HALO_CSS = `
@keyframes halo-spin { to { transform: rotate(360deg); } }
@keyframes halo-pulse { 0%, 100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
.pa-halo {
  animation: halo-spin 6s linear infinite;
  animation-play-state: paused;
  opacity: 0.65;
  filter: blur(11px);
  transition: opacity 0.25s, filter 0.25s;
}
.pa-wrap:hover .pa-halo {
  animation-play-state: running;
  opacity: 1;
  filter: blur(15px);
}
.pa-wrap[data-uploading="true"] .pa-halo { animation: halo-pulse 0.9s ease-in-out infinite; }
.pa-overlay { opacity: 0; transition: opacity 0.15s; }
.pa-wrap:hover .pa-overlay, .pa-wrap[data-uploading="true"] .pa-overlay { opacity: 1; }
`

export function ProfileAvatar({ size = 76, showLabel = true }: { size?: number; showLabel?: boolean }) {
  const t = useT()
  const { user, setUser } = useStore()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = () => inputRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError("")
    setUploading(true)
    try {
      const updated = await authApi.uploadAvatar(file)
      setUser(updated)
    } catch (err: any) {
      setError(apiErrorMessage(err, t("profileAvatar.uploadError")))
    } finally {
      setUploading(false)
    }
  }

  const letter = (user?.display_name || user?.username || "?")[0].toUpperCase()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <style>{HALO_CSS}</style>
      <div
        className="pa-wrap"
        data-uploading={uploading}
        onClick={pick}
        style={{ position: "relative", width: size, height: size, cursor: "pointer" }}
      >
        <div className="pa-halo" style={{
          position: "absolute", inset: -6, borderRadius: "50%",
          background: `conic-gradient(from 0deg, ${v2.violet}, ${v2.teal}, ${v2.violet})`,
        }} />
        <div style={{
          position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden",
          background: "rgba(139,128,240,0.15)", border: "0.5px solid rgba(139,128,240,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {user?.avatar_url ? (
            <img src={resolveMediaUrl(user.avatar_url)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: size * 0.36, fontWeight: 800, color: v2.violet }}>{letter}</span>
          )}
        </div>
        <div className="pa-overlay" style={{
          position: "absolute", inset: 0, borderRadius: 18,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Camera size={Math.round(size * 0.28)} color="#fff" />
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} style={{ display: "none" }} />
      </div>
      {showLabel && (
        <button
          onClick={pick}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontSize: 11.5, color: v2.t3, textAlign: "left", width: "fit-content",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = v2.t2}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = v2.t3}
        >
          {uploading ? t("profileAvatar.uploading") : t("profileAvatar.uploadPrompt")}
        </button>
      )}
      {error && <span style={{ fontSize: 11, color: v2.red, maxWidth: size }}>{error}</span>}
    </div>
  )
}
