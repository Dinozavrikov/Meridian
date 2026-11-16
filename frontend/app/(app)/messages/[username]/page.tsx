"use client"
import React, { useState, useRef, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { messagesApi, api, resolveMediaUrl } from "@/lib/api"
import { useStore } from "@/lib/store"
import { usePresence } from "@/lib/use-presence"
import { Avatar } from "@/components/ui/avatar"
import { splitAttachment } from "@/components/ui/image-attachment"
import { getYouTubeId, getVimeoId } from "@/lib/embed-utils"
import { ConvEntry, CONV_COLUMN_MAX_WIDTH } from "@/components/messages/conv-entry"
import { nextOptimisticId } from "@/lib/optimistic-id"
import { v2, parseEntityDate } from "@/lib/theme"
import { X, Video, Image as ImageIcon, Loader2, Play } from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"

import { ru } from "date-fns/locale"
import { useT } from "@/lib/i18n/useT"
import { useListContentTranslation } from "@/lib/i18n/useContentT"

interface MessageOut {
  id: number
  conversation_id: number
  author_id: number
  content: string
  read: boolean
  created_at: string
}

function dayLabel(t: (key: string, vars?: Record<string, string | number>) => string, date: Date): string {
  if (isToday(date)) return t("messagesPage.todayLabel", { date: format(date, "d MMMM", { locale: ru }) })
  if (isYesterday(date)) return t("messagesPage.yesterdayLabel", { date: format(date, "d MMMM", { locale: ru }) })
  return format(date, "d MMMM yyyy", { locale: ru })
}

function groupByDay(t: (key: string, vars?: Record<string, string | number>) => string, messages: MessageOut[]) {
  const groups: { key: string; label: string; items: MessageOut[] }[] = []
  for (const m of messages) {
    const d = parseEntityDate(m.created_at)!
    const key = format(d, "yyyy-MM-dd")
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(m)
    else groups.push({ key, label: dayLabel(t, d), items: [m] })
  }
  return groups
}

function MeridianLinkHeader({ presence, t }: { presence: "offline" | "online" | "typing"; t: (key: string) => string }) {
  return (
    <div
      className="meridian-link"
      data-presence={presence}
      style={{ flex: 1, height: 40, minWidth: 48, margin: "0 14px" }}
      role="status"
      aria-label={presence === "typing" ? t("messagesPage.peerTypingStatus") : presence === "online" ? t("messagesPage.connectedStatus") : t("messagesPage.disconnectedStatus")}
    >
      <svg viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="convArcGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={v2.teal} />
            <stop offset="1" stopColor={v2.violet} />
          </linearGradient>
        </defs>
        <path
          d="M0,20 C 90,-14 210,54 300,20"
          fill="none"
          stroke="url(#convArcGrad)"
          strokeWidth={1.2}
          opacity={presence === "offline" ? 0.14 : 0.28}
        />
        <circle className="meridian-pulse" fill={v2.teal} style={{ animationDuration: presence === "typing" ? "1.6s" : "4.5s" }} />
      </svg>
    </div>
  )
}

function SendArc({ firing, disabled, t }: { firing: boolean; disabled: boolean; t: (key: string) => string }) {
  return (
    <button
      type="submit"
      className="conv-send-arc"
      data-firing={firing ? "true" : undefined}
      disabled={disabled}
      aria-label={t("messagesPage.sendMessageLabel")}
      style={{
        width: 44, height: 40, borderRadius: 10, flexShrink: 0, border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: disabled ? "rgba(255,255,255,0.04)" : "rgba(77,207,166,0.08)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden="true">
        <path d="M4,19 Q13,3 22,19" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1.6} />
        <path className="arc-fill" d="M4,19 Q13,3 22,19" />
      </svg>
    </button>
  )
}

export default function ConversationPage() {
  const t = useT()
  const { username: rawUsername } = useParams<{ username: string }>()
  const username = decodeURIComponent(rawUsername)
  const currentUser = useStore(s => s.user)
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [pendingImage, setPendingImage] = useState<{ url: string } | null>(null)
  const [pendingVideo, setPendingVideo] = useState<{ url: string } | null>(null)
  const [videoInput, setVideoInput] = useState(false)
  const [videoUrlDraft, setVideoUrlDraft] = useState("")
  const [videoError, setVideoError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [firing, setFiring] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasTyping = useRef(false)

  const { presence, peerTyping, setTyping } = usePresence(username)

  const { data: profile } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.get(`/api/v1/users/${username}`).then(r => r.data),
    enabled: !!username,
  })

  const { data: messages = [], isLoading } = useQuery<MessageOut[]>({
    queryKey: ["conversation", username],
    queryFn: () => messagesApi.getConversation(username),
    enabled: !!username,
    refetchInterval: 5000,
  })

  // Перевод входящих сообщений (не своих). Переводим уже отделённый от
  // вложения текст (splitAttachment), а не сырой content — иначе строка
  // с URL картинки/видео улетела бы в переводчик вместе с текстом.
  const translatableMessages = useMemo(() => messages.map(m => ({
    id: m.id,
    mine: m.author_id === currentUser?.id,
    text: splitAttachment(m.content).text,
  })), [messages, currentUser?.id])
  const trMsg = useListContentTranslation("message", translatableMessages, ["text"], (m) => m.mine)

  // Optimistic send: сообщение появляется в треде мгновенно, до ответа
  // сервера. onMutate пишет временную запись прямо в кэш react-query;
  // onError откатывает кэш и возвращает текст в поле ввода, если сервер
  // отказал; onSettled сверяет с реальным состоянием сервера в любом
  // случае (успех или откат) — так временная запись всегда заменяется
  // настоящей, без дублей. send.isPending намеренно нигде не используется
  // как блокировка — несколько сообщений подряд должны улетать параллельно,
  // не дожидаясь друг друга.
  const send = useMutation({
    mutationFn: (content: string) => messagesApi.sendMessage(username, content),
    onMutate: async (content: string) => {
      await qc.cancelQueries({ queryKey: ["conversation", username] })
      const previous = qc.getQueryData<MessageOut[]>(["conversation", username])
      const optimisticMessage: MessageOut = {
        id: nextOptimisticId(),
        conversation_id: previous?.[0]?.conversation_id ?? 0,
        author_id: currentUser?.id ?? -1,
        content,
        read: false,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<MessageOut[]>(["conversation", username], (old = []) => [...old, optimisticMessage])
      requestAnimationFrame(scrollToBottom)
      return { previous }
    },
    onError: (_err, content, context) => {
      if (context?.previous) qc.setQueryData(["conversation", username], context.previous)
      setText(content)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversation", username] })
      qc.invalidateQueries({ queryKey: ["conversations"] })
    },
  })

  const scrollToBottom = () => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, peerTyping])

  const handleTextChange = (next: string) => {
    setText(next)
    if (!wasTyping.current) {
      wasTyping.current = true
      setTyping(true)
    }
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current)
    typingIdleTimer.current = setTimeout(() => {
      wasTyping.current = false
      setTyping(false)
    }, 2500)

    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px"
    }
  }

  const handleSend = () => {
    const trimmedText = text.trim()
    if (!trimmedText && !pendingImage && !pendingVideo) return
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current)
    wasTyping.current = false
    setTyping(false)
    setFiring(true)
    setTimeout(() => setFiring(false), 350)

    const attachment = pendingImage?.url ?? pendingVideo?.url
    const content = attachment ? (trimmedText ? `${trimmedText}\n${attachment}` : attachment) : trimmedText
    setText("")
    setPendingImage(null)
    setPendingVideo(null)
    send.mutate(content)
    requestAnimationFrame(scrollToBottom)

    const ta = textareaRef.current
    if (ta) ta.style.height = "auto"
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    try {
      const { url } = await messagesApi.uploadImage(file)
      setPendingVideo(null)
      setPendingImage({ url })
    } catch (err) {
      console.error("Не удалось загрузить вложение", err)
    } finally {
      setUploading(false)
    }
  }

  const addVideo = () => {
    const url = videoUrlDraft.trim()
    if (!url) return
    if (!getYouTubeId(url) && !getVimeoId(url)) {
      setVideoError(true)
      return
    }
    setPendingImage(null)
    setPendingVideo({ url })
    setVideoUrlDraft("")
    setVideoError(false)
    setVideoInput(false)
  }

  const groups = groupByDay(t, messages)
  const displayName = profile?.display_name || username

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      <div className="conv-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 24px 18px", borderBottom: `1px solid ${v2.bd}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>
          <a href={`/profile/${username}`} style={{ display: "block" }}>
            <Avatar name={displayName} size={40} avatarUrl={profile?.avatar_url} />
          </a>
          <a href={`/profile/${username}`} className="conv-head-name" style={{ fontSize: 12, fontWeight: 600, color: v2.t1, textDecoration: "none" }}>
            {displayName}
          </a>
          <span className="conv-head-role" style={{
            fontSize: 10,
            color: peerTyping ? v2.violet : presence === "online" ? v2.teal : v2.t3,
          }}>
            {peerTyping ? t("messagesPage.typingIndicator") : presence === "online" ? t("messagesPage.onlineStatus") : `@${username}`}
          </span>
        </div>

        <MeridianLinkHeader presence={presence} t={t} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <a href={`/profile/${currentUser?.username}`} style={{ display: "block" }}>
            <Avatar name={currentUser?.display_name || currentUser?.username || t("messagesPage.selfFallbackName")} size={40} avatarUrl={currentUser?.avatar_url} />
          </a>
          <a href={`/profile/${currentUser?.username}`} className="conv-head-name" style={{ fontSize: 12, fontWeight: 600, color: v2.t1, textDecoration: "none" }}>
            {currentUser?.display_name || currentUser?.username}
          </a>
          <span className="conv-head-role" style={{ fontSize: 10, color: v2.t3 }}>{t("messagesPage.youLabel")}</span>
        </div>
      </div>

      <div className="conv-thread" ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "24px 24px 16px", minHeight: 0 }}>
        <div style={{ maxWidth: CONV_COLUMN_MAX_WIDTH, margin: "0 auto" }}>
        {isLoading ? (
          <div style={{ color: v2.t3, fontSize: 13, textAlign: "center", padding: "40px 0" }}>{t("messagesPage.loading")}</div>
        ) : groups.length === 0 && !peerTyping ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: v2.t2, fontWeight: 500, margin: "0 0 4px" }}>{t("messagesPage.emptyThreadTitle")}</p>
            <p style={{ fontSize: 12, color: v2.t3, margin: 0 }}>{t("messagesPage.emptyThreadSubtitle")}</p>
          </div>
        ) : (
          <>
            {groups.map(group => (
              <div key={group.key}>
                <div style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: v2.t3, margin: "4px 0 20px" }}>
                  <span style={{ background: v2.surf, padding: "0 12px" }}>{group.label}</span>
                </div>
                {group.items.map(m => {
                  const mine = m.author_id === currentUser?.id
                  const { text: bodyText, imageUrl, videoUrl } = splitAttachment(m.content)
                  const displayText = trMsg({ id: m.id, mine, text: bodyText }, "text", bodyText)
                  const ytId = videoUrl ? getYouTubeId(videoUrl) : null
                  const viId = videoUrl && !ytId ? getVimeoId(videoUrl) : null
                  return (
                    <ConvEntry
                      key={m.id}
                      mine={mine}
                      authorName={mine ? (currentUser?.display_name || currentUser?.username || "") : displayName}
                      authorHref={`/profile/${mine ? currentUser?.username : username}`}
                      time={format(parseEntityDate(m.created_at)!, "HH:mm", { locale: ru })}
                      text={displayText}
                      imageSrc={imageUrl ? (resolveMediaUrl(imageUrl) || imageUrl) : null}
                      ytId={ytId}
                      viId={viId}
                    />
                  )
                })}
              </div>
            ))}
            {peerTyping && (
              <div className="conv-entry-row them" style={{ display: "flex", justifyContent: "flex-start", marginBottom: 20 }}>
                <div className="conv-entry" style={{
                  padding: "11px 14px 10px", borderRadius: 12, background: "rgba(255,255,255,0.015)",
                  border: "1px solid rgba(139,128,240,0.28)", boxShadow: `inset 2px 0 0 ${v2.violet}`,
                }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: v2.violet, marginBottom: 5 }}>
                    {displayName}
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: "2px 0" }} aria-label={t("messagesPage.typingAria", { name: displayName })}>
                    <span className="conv-typing-dot" />
                    <span className="conv-typing-dot" />
                    <span className="conv-typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <form
        className="conv-composer"
        onSubmit={e => { e.preventDefault(); handleSend() }}
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 20px", borderTop: `1px solid ${v2.bd}`, background: "rgba(0,0,0,0.15)", flexShrink: 0 }}
      >
        {videoInput && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Video size={13} color="#E74C3C" style={{ flexShrink: 0 }} />
            <input

              value={videoUrlDraft}
              onChange={e => { setVideoUrlDraft(e.target.value); setVideoError(false) }}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); addVideo() }
                if (e.key === "Escape") { setVideoInput(false); setVideoUrlDraft(""); setVideoError(false) }
              }}
              placeholder={t("messagesPage.videoLinkPlaceholder")}
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${videoError ? "#E74C3C" : "#E74C3C30"}`,
                borderRadius: 6, padding: "6px 10px", color: v2.t1, fontSize: 12.5, outline: "none", fontFamily: "inherit",
              }}
            />
            <button type="button" onClick={addVideo} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 6, border: "none", background: "#E74C3C", color: "#fff", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
              {t("actions.save")}
            </button>
            <button type="button" onClick={() => { setVideoInput(false); setVideoUrlDraft(""); setVideoError(false) }} style={{ background: "transparent", border: "none", color: v2.t3, cursor: "pointer", padding: 2, flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        )}
        {videoError && (
          <span style={{ fontSize: 11, color: "#E74C3C", marginLeft: 19 }}>{t("messagesPage.invalidVideoLink")}</span>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelected}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t("messagesPage.attachImageLabel")}
            title={t("messagesPage.attachImageLabel")}
            disabled={uploading}
            style={{
              width: 26, height: 26, marginBottom: 15, borderRadius: 6, flexShrink: 0,
              border: "1px solid rgba(255,255,255,0.13)",
              background: "transparent",
              color: "rgba(255,255,255,0.35)",
              cursor: uploading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
            }}
          >
            {uploading ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <ImageIcon size={13} />}
          </button>

          <button
            type="button"
            onClick={() => setVideoInput(v => !v)}
            aria-label={t("messagesPage.attachVideoLabel")}
            title={t("messagesPage.attachVideoLabel")}
            style={{
              width: 26, height: 26, marginBottom: 15, borderRadius: 6, flexShrink: 0,
              border: `1px solid ${videoInput ? "#E74C3C40" : "rgba(255,255,255,0.13)"}`,
              background: videoInput ? "#E74C3C14" : "transparent",
              color: videoInput ? "#E74C3C" : "rgba(255,255,255,0.35)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
            }}
          >
            <Video size={13} />
          </button>

          <div style={{
            flex: 1, display: "flex", alignItems: "flex-end", gap: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 10, padding: (pendingImage || pendingVideo) ? "6px 8px" : "0",
          }}>
            {pendingImage && (
              <div className="attach-chip">
                <img src={resolveMediaUrl(pendingImage.url) || pendingImage.url} alt="" />
                <button type="button" onClick={() => setPendingImage(null)} aria-label={t("messagesPage.removeAttachmentLabel")}>
                  <X size={11} />
                </button>
              </div>
            )}
            {pendingVideo && (() => {
              return (
                <div className="attach-chip" style={{ position: "relative" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                    <Play size={12} color="#fff" fill="#fff" aria-hidden />
                  </div>
                  <button type="button" onClick={() => setPendingVideo(null)} aria-label={t("messagesPage.removeAttachmentLabel")}>
                    <X size={11} />
                  </button>
                </div>
              )
            })()}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("messagesPage.composerPlaceholder")}
              rows={1}
              style={{
                flex: 1, resize: "none", background: "transparent", border: "none",
                padding: (pendingImage || pendingVideo) ? "4px 4px" : "11px 15px",
                fontSize: 13.5, color: v2.t1, outline: "none", fontFamily: "inherit",
                maxHeight: 140, lineHeight: 1.4,
              }}
            />
          </div>

          <SendArc firing={firing} disabled={!text.trim() && !pendingImage && !pendingVideo} t={t} />
        </div>
      </form>

    </div>
  )
}
