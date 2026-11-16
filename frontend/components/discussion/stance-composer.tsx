"use client"
import { useRef, useState } from "react"
import { Check, X, Link2, Image as ImageIcon, X as CloseIcon } from "lucide-react"
import { api, resolveMediaUrl } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { theme } from "@/lib/theme"
import { toast } from "@/lib/toast"

export function StanceComposer({ onSubmit, loading, replyTo, onCancelReply }: {
  onSubmit: (content: string, stance: string) => void
  loading: boolean
  replyTo?: { author: string } | null
  onCancelReply?: () => void
}) {
  const t = useT()
  const STANCES = [
    { value: "confirm", label: t("stanceComposer.confirm"), color: "#27AE60", icon: Check },
    { value: "neutral", label: t("stanceComposer.neutral"), color: "#8b91a8", icon: Link2 },
    { value: "refute",  label: t("stanceComposer.refute"),  color: "#E74C3C", icon: X },
  ] as const

  const [stance, setStance] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const attachImage = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const { data } = await api.post("/api/v1/comments/upload-image", form, { headers: { "Content-Type": "multipart/form-data" } })
      setAttachments(a => [...a, data.url])
    } catch {
      toast({ message: t("stanceComposer.uploadError"), tone: "error" })
    } finally {
      setUploading(false)
    }
  }

  const canSubmit = (text.trim().length > 0 || attachments.length > 0) && !!stance

  const submit = () => {
    if (!canSubmit) return
    const content = [text.trim(), ...attachments].filter(Boolean).join("\n")
    onSubmit(content, stance!)
    setText(""); setStance(null); setAttachments([])
  }

  return (
    <div style={{ marginTop: 30, paddingTop: 22, borderTop: `1px solid ${theme.ln1}` }}>
      {replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: theme.tx3 }}>
          {t("stanceComposer.replyingFor")} <b style={{ color: theme.tx2 }}>{replyTo.author}</b>
          <button onClick={onCancelReply} style={{ background: "none", border: "none", color: theme.tx4, cursor: "pointer" }}>{t("stanceComposer.cancelReply")}</button>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: theme.tx3, marginBottom: 10 }}>{t("stanceComposer.takeStance")}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {STANCES.map(s => {
          const Icon = s.icon
          const active = stance === s.value
          return (
            <button key={s.value} onClick={() => setStance(s.value)} style={{
              display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 9,
              border: `1px solid ${active ? s.color : theme.ln2}`,
              background: active ? `${s.color}29` : theme.bg1,
              color: active ? s.color : theme.tx3,
            }}>
              <Icon size={14} /> {s.label}
            </button>
          )
        })}
      </div>

      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {attachments.map((url, i) => (
            <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${theme.ln2}` }}>
              <img src={resolveMediaUrl(url) ?? url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button onClick={() => setAttachments(a => a.filter((_, idx) => idx !== i))} style={{
                position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%",
                background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CloseIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder={attachments.length > 0 ? t("stanceComposer.placeholderWithImage") : t("stanceComposer.placeholderDefault")}
          rows={3}
          style={{ flex: 1, minHeight: 64, resize: "vertical", background: theme.bg1, border: `1px solid ${theme.ln2}`, borderRadius: 10, color: theme.tx1, fontFamily: "inherit", fontSize: 13, padding: "12px 14px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignSelf: "flex-end" }}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) attachImage(f); e.target.value = "" }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} title={t("stanceComposer.attachImageTitle")} style={{
            width: 38, height: 38, borderRadius: 9, border: `1px solid ${theme.ln2}`, background: theme.bg1, color: uploading ? theme.tx4 : theme.tx3,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ImageIcon size={15} />
          </button>
        </div>
        <button onClick={submit} disabled={!canSubmit || loading}
          style={{
            flexShrink: 0, alignSelf: "flex-end", background: canSubmit ? "#4A90D9" : theme.bg3,
            color: canSubmit ? "#fff" : theme.tx4, border: "none", fontSize: 12.5, fontWeight: 700,
            padding: "11px 20px", borderRadius: 9, cursor: canSubmit ? "pointer" : "default",
          }}>
          {loading ? t("stanceComposer.publishing") : t("stanceComposer.publish")}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: !stance ? "#F5A623" : theme.tx4, marginTop: 8 }}>
        {!stance ? t("stanceComposer.needStance") : t("stanceComposer.stanceDeterminesColumn")}
      </div>
    </div>
  )
}
