"use client"
import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useStore } from "@/lib/store"
import { Pencil, Trash2, Send, Video, X, Play, Paperclip, Lock } from "lucide-react"
import { theme, v2, ink, parseEntityDate } from "@/lib/theme"
import { Avatar } from "@/components/ui/avatar"
import { isImageUrl, isUrl, ImageAttachment } from "@/components/ui/image-attachment"
import { useIsMobile } from "@/lib/use-is-mobile"
import { useT } from "@/lib/i18n/useT"
import { askConfirm } from "@/lib/confirm"
import { useRequireAuth } from "@/lib/use-require-auth"
import { useMarkSeen } from "@/lib/use-unread"
import { splitPersonalNotes } from "@/lib/discussion-notes"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { getYouTubeId, getVimeoId } from "@/lib/embed-utils"
import { VideoAttachment } from "@/components/ui/video-attachment"

const FADE_AFTER_MS = 8000
const EMPTY: any[] = []
const EMPTY_SET: Set<number> = new Set()
const EMPTY_TYPES = ["observation", "hypothesis", "prediction", "question", "task", "worldview"]

// Весь вид — в одном блоке: цвета только из токенов, ховеры и показ действий через CSS, а не обработчиками.
const CSS = `
.nt-root{display:flex;flex-direction:column}
.nt-note{position:relative}
.nt-main{display:flex;padding-bottom:6px}
.nt-side{width:56px;flex-shrink:0;padding:7px 10px 0 0;text-align:right;font-family:${theme.mono};white-space:nowrap}
.nt-day{font-size:12px;font-weight:600;color:${ink.label}}
.nt-time{font-size:11px;color:${ink.muted}}
.nt-rail{position:relative;width:34px;flex-shrink:0;display:flex;justify-content:center;padding-top:5px}
.nt-line{position:absolute;top:36px;bottom:-4px;width:1px;background:linear-gradient(to bottom,var(--nt-line),transparent)}
.nt-body{flex:1;min-width:0}
.nt-card{padding:5px 10px 4px;border-radius:10px;border:1px solid transparent;transition:background .6s,border-color .6s}
.nt-card[data-new="true"]{background:var(--nt-soft);border-color:var(--nt-line)}
.nt-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:3px}
.nt-author{font-size:12px;font-weight:700;text-decoration:none}
.nt-stamp{font:500 11.5px ${theme.mono};color:${ink.muted}}
.nt-badge{font:600 10px ${theme.mono};letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:6px;color:var(--nt);background:var(--nt-soft);border:1px solid var(--nt-line)}
.nt-actions{display:flex;gap:2px;margin-top:4px;opacity:0;transition:opacity .15s}
.nt-main:hover .nt-actions,.nt-actions:focus-within{opacity:1}
@media (hover:none){.nt-actions{opacity:1}}
.nt-ghost{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border:none;border-radius:6px;background:transparent;color:${ink.label};font-size:12px;cursor:pointer;transition:color .12s,background .12s}
.nt-ghost:hover{color:var(--nt);background:var(--nt-hov)}
.nt-ghost[data-danger="true"]:hover{color:${v2.red};background:${v2.red}14}
.nt-divider{display:flex;align-items:center;gap:10px;margin:2px 0 12px;color:var(--nt);font:600 11px ${theme.mono};letter-spacing:.08em;text-transform:uppercase;transition:opacity .6s}
.nt-divider::before,.nt-divider::after{content:"";height:1px;flex:1;background:var(--nt-line)}
.nt-divider[data-faded="true"]{opacity:.45}
.nt-readonly{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:${v2.surf2};border:1px solid ${v2.bd}}
.nt-box{border-radius:10px;border:1px solid ${v2.bd};background:${ink.well};overflow:hidden;transition:border-color .2s,box-shadow .2s}
.nt-box[data-focus="true"]{border-color:var(--nt-line);box-shadow:0 0 0 3px var(--nt-soft)}
.nt-tool{display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid ${v2.bd2};background:transparent;color:${v2.t4};cursor:pointer;transition:color .12s,border-color .12s,background .12s}
.nt-tool:hover,.nt-tool[data-on="true"]{color:var(--tool);border-color:var(--tool)}
.nt-send{display:flex;align-items:center;gap:5px;border:none;border-radius:8px;font-weight:600;white-space:nowrap;flex-shrink:0;transition:filter .15s}
.nt-send:not(:disabled):hover{filter:brightness(1.12)}
@media (prefers-reduced-motion:reduce){.nt-card,.nt-divider,.nt-actions{transition:none}}
`

function NoteText({ text, accent }: { text: string; accent: string }) {
  const lines = text.split("\n")
  const images: string[] = []
  const videos: React.ReactNode[] = []
  const textLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!isUrl(trimmed)) { textLines.push(line); continue }
    const ytId = getYouTubeId(trimmed)
    const viId = !ytId ? getVimeoId(trimmed) : null
    if (ytId || viId) { videos.push(<VideoAttachment key={trimmed} ytId={ytId} viId={viId} accent={accent} maxWidth={480} collapsedMaxWidth={280} />) }
    else if (isImageUrl(trimmed)) { images.push(trimmed) }
    else { textLines.push(line) }
  }
  const textContent = textLines.join("\n").trim()
  return (
    <div>
      {textContent && <div style={{ fontSize: 14, color: theme.tx2, lineHeight: 1.65, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{textContent}</div>}
      {images.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: textContent ? 8 : 0 }}>{images.map((src, i) => <ImageAttachment key={i} src={src} accent={accent} />)}</div>}
      {videos.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: (textContent || images.length) ? 8 : 0 }}>{videos}</div>}
    </div>
  )
}

const hue = (name: string) => name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360
const collectNew = (list: any[]): Set<number> => {
  const out = new Set<number>()
  const walk = (l: any[]) => l.forEach(c => { if (c.is_new) out.add(c.id); if (c.replies?.length) walk(c.replies) })
  walk(list); return out
}
const hasNew = (n: any, ids: Set<number>): boolean => ids.has(n.id) || (n.replies ?? []).some((r: any) => hasNew(r, ids))
const countAll = (list: any[]): number => list.reduce((a, c) => a + 1 + countAll(c.replies ?? []), 0)

interface ItemProps {
  note: any; depth: number; accent: string; currentUserId?: number; readOnly: boolean
  newIds: Set<number>; faded: boolean; editingId: number | null
  onEdit: (id: number) => void; onCancelEdit: () => void; onSave: (id: number, text: string) => void
  onDelete: (id: number) => void; onReply: (note: any) => void
}

function NoteItem(p: ItemProps) {
  const { note, depth, accent, currentUserId, readOnly, newIds, faded } = p
  const t = useT()
  const isMobile = useIsMobile()
  const isOwn = currentUserId === note.author_id
  const translated = useTranslatedField("comment", note.id, "content", note.content, isOwn)
  const authorName = note.author_display || note.author_username || t("notes.anonymous")
  const h = hue(authorName)
  const created = parseEntityDate(note.created_at)
  const dayText = created ? created.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : ""
  const timeText = created ? created.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""
  const isNew = newIds.has(note.id)
  const showSide = !isMobile && depth === 0
  const nameStyle = { color: `hsl(${h},50%,72%)` }
  return (
    <div className="nt-note" data-testid={`note-${note.id}`}>
      <div className="nt-main">
        {showSide && <div className="nt-side"><div className="nt-day">{dayText}</div><div className="nt-time">{timeText}</div></div>}
        <div className="nt-rail">
          <Avatar name={authorName} avatarUrl={note.author_avatar_url} size={depth > 0 ? 22 : 26} ringColor={isNew && !faded ? accent : undefined} />
          <span className="nt-line" aria-hidden />
        </div>
        <div className="nt-body">
          <div className="nt-card" data-new={isNew && !faded ? "true" : "false"}>
            <div className="nt-head">
              {note.author_username
                ? <Link href={`/profile/${note.author_username}`} className="nt-author" style={nameStyle}>{authorName}</Link>
                : <span className="nt-author" style={nameStyle}>{authorName}</span>}
              {!showSide && <span className="nt-stamp">{dayText} · {timeText}</span>}
              {isNew && <span className="nt-badge">{t("notes.newBadge")}</span>}
            </div>
            {p.editingId === note.id ? (
              <EditForm note={note} accent={accent} onSave={text => p.onSave(note.id, text)} onCancel={p.onCancelEdit} />
            ) : (
              <>
                <NoteText text={translated} accent={accent} />
                {!readOnly && (
                  <div className="nt-actions">
                    <button type="button" className="nt-ghost" onClick={() => p.onReply(note)}>{t("notes.reply")}</button>
                    {isOwn && (<>
                      <button type="button" className="nt-ghost" onClick={() => p.onEdit(note.id)}><Pencil size={10} /> {t("notes.edit")}</button>
                      <button type="button" className="nt-ghost" data-danger="true" aria-label={t("confirm.delete")} onClick={() => p.onDelete(note.id)}><Trash2 size={10} /></button>
                    </>)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {(note.replies ?? []).length > 0 && (
        <div className="nt-replies" style={{ marginLeft: depth >= 2 ? 0 : isMobile ? 12 : 24 }}>
          {note.replies.map((r: any) => <NoteItem key={r.id} {...p} note={r} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

function AttachmentChip({ kind, value, onRemove }: { kind: "image" | "video"; value: string; onRemove: () => void }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      {kind === "image" ? (
        <img src={value} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${v2.bd2}`, display: "block" }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${v2.bd2}`, background: theme.bg0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
          <Play size={12} color="#fff" fill="#fff" style={{ position: "absolute" }} />
        </div>
      )}
      <button type="button" onClick={onRemove}
        style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: theme.bg3, border: `1px solid ${v2.bd2}`, color: v2.t3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        <X size={9} />
      </button>
    </div>
  )
}

function Compose({ accent, onSubmit, loading, replyTo, onClearReply, currentUser }: { accent: string; onSubmit: (text: string, parentId?: number) => void; loading: boolean; replyTo?: any; onClearReply?: () => void; currentUser?: any }) {
  const t = useT()
  const isMobile = useIsMobile()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [videos, setVideos] = useState<string[]>([])
  const [videoInput, setVideoInput] = useState(false)
  const [videoUrl, setVideoUrl] = useState("")
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hasContent = !!text.trim() || images.length > 0 || videos.length > 0

  const uploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImages(list => [...list, reader.result as string])
    reader.readAsDataURL(file)
    e.target.value = ""
  }
  const addVideo = () => {
    const url = videoUrl.trim()
    if (!url || (!getYouTubeId(url) && !getVimeoId(url))) return
    setVideos(list => [...list, url]); setVideoUrl(""); setVideoInput(false)
  }
  const submit = () => {
    if (!hasContent) return
    onSubmit([text.trim(), ...images, ...videos].filter(Boolean).join("\n"), replyTo?.id)
    setText(""); setImages([]); setVideos([])
  }
  React.useEffect(() => { if (replyTo) { taRef.current?.focus(); setFocused(true) } }, [replyTo])

  const authorLabel = currentUser?.display_name || currentUser?.username || t("notes.you")
  const toolSize = { width: isMobile ? 36 : 26, height: isMobile ? 34 : 24 }
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", gap: isMobile ? 8 : 0 }}>
      {isMobile ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 2 }}>
          <Avatar name={authorLabel} avatarUrl={currentUser?.avatar_url} size={20} ringColor={focused ? accent : undefined} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: v2.t3 }}>{authorLabel}</span>
        </div>
      ) : (
        <div className="w-[90px]" style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", paddingRight: 10, paddingTop: 6 }}>
          <Avatar name={authorLabel} avatarUrl={currentUser?.avatar_url} size={26} ringColor={focused ? accent : undefined} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {replyTo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4, borderRadius: "8px 8px 0 0", background: v2.surf2, borderLeft: `2px solid ${accent}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10.5, color: accent, fontWeight: 600 }}>→ {replyTo.author_display || replyTo.author_username}</span>
              <div style={{ fontSize: 11.5, color: v2.t3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{replyTo.content}</div>
            </div>
            <button type="button" onClick={onClearReply} style={{ border: "none", background: "transparent", color: v2.t4, cursor: "pointer", padding: 2, flexShrink: 0 }}><X size={12} /></button>
          </div>
        )}
        <div className="nt-box" data-focus={focused ? "true" : "false"}>
          {(images.length > 0 || videos.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px 0" }}>
              {images.map((src, i) => <AttachmentChip key={"i" + i} kind="image" value={src} onRemove={() => setImages(list => list.filter((_, idx) => idx !== i))} />)}
              {videos.map((url, i) => <AttachmentChip key={"v" + i} kind="video" value={url} onRemove={() => setVideos(list => list.filter((_, idx) => idx !== i))} />)}
            </div>
          )}
          <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit() }}
            placeholder={isMobile ? t("notes.composePlaceholderShort") : t("notes.composePlaceholderFull")} rows={focused ? 3 : 1}
            className={`notes-compose-textarea${focused ? " is-focused" : ""}`}
            style={{ width: "100%", padding: "8px 12px", border: "none", background: "transparent", color: theme.tx2, fontSize: 13, lineHeight: 1.7, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" } as React.CSSProperties} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={uploadFile} style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }} />
          {videoInput && (
            <div style={{ display: "flex", gap: 6, padding: "0 10px 8px", alignItems: "center" }}>
              <Video size={11} color={v2.red} style={{ flexShrink: 0 }} />
              <input autoFocus value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addVideo(); if (e.key === "Escape") { setVideoInput(false); setVideoUrl("") } }}
                placeholder={t("notes.videoLinkPlaceholder")}
                style={{ flex: 1, background: v2.surf2, border: `1px solid ${v2.red}40`, borderRadius: 5, padding: "4px 8px", color: theme.tx2, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              <button type="button" onClick={addVideo} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, border: "none", background: v2.red, color: "#fff", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>{t("actions.save")}</button>
              <button type="button" onClick={() => { setVideoInput(false); setVideoUrl("") }} style={{ background: "transparent", border: "none", color: v2.t4, cursor: "pointer", padding: 2, flexShrink: 0 }}><X size={11} /></button>
            </div>
          )}
          {(focused || hasContent) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 6, padding: "4px 8px 8px" }}>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button type="button" className="nt-tool" data-on={videoInput ? "true" : "false"} style={{ ...toolSize, ["--tool" as string]: v2.red } as React.CSSProperties}
                  title={t("notes.attachVideo")} aria-label={t("notes.attachVideo")} onMouseDown={e => { e.preventDefault(); setVideoInput(v => !v) }}><Video size={12} /></button>
                <button type="button" className="nt-tool" style={{ ...toolSize, ["--tool" as string]: v2.violet } as React.CSSProperties}
                  title={t("notes.attachImage")} aria-label={t("notes.attachImage")} onMouseDown={e => { e.preventDefault(); fileRef.current?.click() }}><Paperclip size={12} /></button>
              </div>
              <button type="button" className="nt-send" onClick={submit} disabled={!hasContent || loading}
                style={{ padding: isMobile ? "8px 16px" : "5px 13px", background: hasContent ? accent : v2.surf2, color: hasContent ? "#fff" : v2.t4, fontSize: isMobile ? 13 : 12, cursor: hasContent ? "pointer" : "default" }}>
                <Send size={11} /> {loading ? "…" : t("notes.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditForm({ note, accent, onSave, onCancel }: { note: any; accent: string; onSave: (text: string) => void; onCancel: () => void }) {
  const t = useT()
  const [text, setText] = useState(note.content)
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${accent}40`, background: ink.well, color: theme.tx2, fontSize: 13, lineHeight: 1.7, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={() => onSave(text)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "none", background: accent, color: "#fff", cursor: "pointer", fontWeight: 600 }}>{t("notes.save")}</button>
        <button type="button" onClick={onCancel} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: `1px solid ${v2.bd2}`, background: "transparent", color: v2.t3, cursor: "pointer" }}>{t("notes.cancel")}</button>
      </div>
    </div>
  )
}

/** Заметки записи. access === "opened": запись открыта зрителю через связь только для чтения, писать нельзя (сервер вернёт 404).
 *  personalOnly — только личные заметки владельца (корневые без позиции и ответы под ними; остальное — обсуждение);
 *  trackSeen=false — не отмечать запись прочитанной (это делает вкладка «Обсуждение»); bare — без собственного заголовка. */
export function NotesTimeline({ entityType, entityId, accent = theme.accent, inLab = false, access, personalOnly = false, trackSeen = true, bare = false }: { entityType: string; entityId: number; accent?: string; inLab?: boolean; access?: string | null; personalOnly?: boolean; trackSeen?: boolean; bare?: boolean }) {
  const t = useT()
  const user = useStore(s => s.user)
  const isMobile = useIsMobile()
  const { isGuest, requireAuth } = useRequireAuth()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<any>(null)
  const readOnly = access === "opened"
  const key = `${entityType}:${entityId}`

  const { data, isLoading } = useQuery({
    queryKey: ["comments", entityType, entityId],
    queryFn: () => api.get(`/api/v1/comments/${entityType}/${entityId}`).then(r => r.data),
    enabled: !!entityId,
  })
  const notes: any[] = personalOnly ? splitPersonalNotes<any>(data ?? EMPTY, user?.username).personal : (data ?? EMPTY)

  // Набор «новых» фиксируется при первой загрузке: после markSeen сервер сочтёт всё прочитанным, но метка остаётся, пока вы здесь.
  const [snap, setSnap] = useState<{ key: string; ids: Set<number> } | null>(null)
  useEffect(() => {
    if (isLoading || !data || snap?.key === key) return
    setSnap({ key, ids: collectNew(data) })
  }, [data, isLoading, key, snap])
  const newIds = snap?.key === key ? snap.ids : EMPTY_SET

  // Гасим бейдж «непрочитано» только когда список уже загружен и набор новых запомнен, иначе отметка обгонит загрузку.
  const markSeen = useMarkSeen()
  useEffect(() => {
    if (!entityId || isGuest || !trackSeen || snap?.key !== key) return
    markSeen.mutate({ entityType, entityId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.key, key, isGuest])

  const [faded, setFaded] = useState(false)
  useEffect(() => {
    setFaded(false)
    if (newIds.size === 0) return
    const id = setTimeout(() => setFaded(true), FADE_AFTER_MS)
    return () => clearTimeout(id)
  }, [newIds])

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comments", entityType, entityId] })
  const add = useMutation({ mutationFn: ({ content, parentId }: { content: string; parentId?: number }) => api.post(`/api/v1/comments/${entityType}/${entityId}`, { content, parent_id: parentId ?? null }).then(r => r.data), onSuccess: () => { invalidate(); setReplyTo(null) } })
  const save = useMutation({ mutationFn: ({ id, content }: { id: number; content: string }) => api.patch(`/api/v1/comments/${id}`, { content }).then(r => r.data), onSuccess: () => { invalidate(); setEditing(null) } })
  const del = useMutation({ mutationFn: (id: number) => api.delete(`/api/v1/comments/${id}`).then(r => r.data), onSuccess: invalidate })

  const total = countAll(notes)
  const firstNew = newIds.size ? notes.find(n => hasNew(n, newIds)) : undefined
  const emptyKey = EMPTY_TYPES.includes(entityType) ? `notes.emptyPrompt.${entityType}` : "notes.empty"
  const confirmDelete = async (id: number) => {
    if (await askConfirm({ title: t("notes.deleteConfirm"), description: inLab ? t("notes.deleteConfirmSnapshots") : undefined, confirmLabel: t("confirm.delete"), tone: "danger" })) del.mutate(id)
  }

  return (
    <div className="nt-root" style={{ ["--nt" as string]: accent, ["--nt-soft" as string]: accent + "14", ["--nt-line" as string]: accent + "3a", ["--nt-hov" as string]: accent + "16" } as React.CSSProperties}>
      <style>{CSS}</style>
      <div style={{ display: bare ? "none" : "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${ink.line}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: accent }}>{t("notes.title")}</span>
        {total > 0 && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: accent + "22", color: accent, border: `1px solid ${accent}40`, fontWeight: 600 }}>{total}</span>}
      </div>
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0.8, 0.5, 0.3].map((o, i) => (<div key={i} style={{ display: "flex", gap: 12, opacity: o }}><div style={{ width: 44, height: 8, borderRadius: 3, background: v2.surf2 }} /><div style={{ flex: 1, height: 8, borderRadius: 3, background: v2.surf }} /></div>))}
        </div>
      ) : total === 0 ? (
        <div style={{ padding: isMobile ? "12px 0 14px 34px" : "12px 0 14px 90px", color: ink.muted, fontSize: 13.5, lineHeight: 1.55, fontFamily: v2.fontSerif, fontStyle: "italic" }}>{t(emptyKey)}</div>
      ) : (
        <div>
          {notes.map(note => (
            <React.Fragment key={note.id}>
              {firstNew?.id === note.id && <div className="nt-divider" data-testid="notes-new-divider" data-faded={faded ? "true" : "false"}>{t("notes.new", { n: newIds.size })}</div>}
              <NoteItem note={note} depth={0} accent={accent} currentUserId={user?.id} readOnly={readOnly} newIds={newIds} faded={faded}
                editingId={editing} onEdit={setEditing} onCancelEdit={() => setEditing(null)} onSave={(id, content) => save.mutate({ id, content })}
                onDelete={confirmDelete} onReply={setReplyTo} />
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ marginTop: total > 0 ? 4 : 0 }}>
        {readOnly ? (
          <div className="nt-readonly" data-testid="notes-readonly" role="note">
            <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${v2.t4}26` }}><Lock size={14} color={v2.t4} /></span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: v2.t2 }}>{t("notes.readOnly")}</span>
              <span style={{ fontSize: 11.5, color: v2.t3 }}>{t("notes.readOnlyHint")}</span>
            </span>
          </div>
        ) : isGuest ? (
          <button type="button" onClick={() => requireAuth(() => {})} style={{
            width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 10,
            border: `1px dashed ${v2.bd2}`, background: "transparent", color: v2.t3, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>{t("notes.guestCompose")}</button>
        ) : (
          <Compose accent={accent} onSubmit={(text, parentId) => add.mutate({ content: text, parentId })} loading={add.isPending} replyTo={replyTo} onClearReply={() => setReplyTo(null)} currentUser={user} />
        )}
      </div>
    </div>
  )
}
