"use client"
import React, { useEffect, useState, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { messagesApi, resolveMediaUrl } from "@/lib/api"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { ResizableLayout } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { Avatar } from "@/components/ui/avatar"
import { splitAttachment } from "@/components/ui/image-attachment"
import { v2, parseEntityDate, sectionSearch, sectionSearchWrap } from "@/lib/theme"
import { Mail, MessageCircle, Search, Play } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useT } from "@/lib/i18n/useT"

interface ConversationOut {
  id: number
  other_user_id: number
  other_username: string
  other_display_name: string
  other_avatar_url: string | null
  last_message: string | null
  last_message_at: string
  unread_count: number
}

const ACCENT = "#4dcfa6"

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()

  // "/messages" -> undefined, "/messages/alexey" -> "alexey"
  const selectedUsername = pathname === "/messages" ? undefined : decodeURIComponent(pathname.split("/").pop() || "")

  const { data: conversations = [], isLoading } = useQuery<ConversationOut[]>({
    queryKey: ["conversations"],
    queryFn: () => messagesApi.listConversations(),
    refetchInterval: 15000,
  })

  // Автовыбор первого диалога на десктопе — тот же паттерн, что в observations/hypotheses/...
  useEffect(() => {
    if (pathname !== "/messages") return
    if (window.matchMedia("(max-width: 768px)").matches) return
    if (conversations.length > 0) {
      router.replace(`/messages/${conversations[0].other_username}`, { scroll: false })
    }
  }, [pathname, conversations, router])

  const [search, setSearch] = useState("")

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c =>
      c.other_display_name.toLowerCase().includes(q) ||
      c.other_username.toLowerCase().includes(q)
    )
  }, [conversations, search])

  const list = (
    <div style={{ background: v2.surf2, borderRight: `1px solid ${v2.bd}`, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", flex: 1 }}>
      <div style={sectionSearchWrap()}>
        <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: v2.t3, pointerEvents: "none" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("messagesPage.searchPlaceholder")}
          style={sectionSearch(ACCENT)}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <div style={{ color: v2.t3, fontSize: 13, padding: "40px 0", textAlign: "center" }}>{t("messagesPage.loading")}</div>
        ) : filteredConversations.length === 0 && !search ? (
          <div style={{
            borderRadius: 14, border: "1px dashed rgba(255,255,255,0.09)", margin: 16,
            padding: "40px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 8, color: v2.t3, textAlign: "center",
          }}>
            <MessageCircle size={22} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 13 }}>{t("messagesPage.emptyTitle")}</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{t("messagesPage.emptySubtitle")}</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: v2.t3, fontSize: 12.5 }}>
            {t("messagesPage.emptyFiltered")}
          </div>
        ) : (
          filteredConversations.map(c => {
            const isActive = c.other_username === selectedUsername
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/messages/${c.other_username}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: isActive ? "rgba(77,207,166,0.08)" : c.unread_count > 0 ? "rgba(77,207,166,0.04)" : "transparent",
                  borderLeft: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
                }}
              >
                <Avatar name={c.other_display_name} size={38} avatarUrl={c.other_avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: v2.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.other_display_name}
                    </span>
                    <span style={{ fontSize: 10.5, color: v2.t3, marginLeft: "auto", flexShrink: 0 }}>
                      {formatDistanceToNow(parseEntityDate(c.last_message_at)!, { addSuffix: true, locale: ru })}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: c.unread_count > 0 ? v2.t2 : v2.t3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2,
                    fontWeight: c.unread_count > 0 ? 600 : 400,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    {(() => {
                      if (!c.last_message) return t("messagesPage.noMessages")
                      const { text, imageUrl, videoUrl } = splitAttachment(c.last_message)
                      if (videoUrl) {
                        return (
                          <>
                            <Play size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <span style={{ fontStyle: text ? "normal" : "italic", opacity: text ? 1 : 0.75 }}>
                              {text || t("messagesPage.videoOnly")}
                            </span>
                          </>
                        )
                      }
                      if (!imageUrl) return text
                      return (
                        <>
                          <img
                            className="conv-list-thumb"
                            src={resolveMediaUrl(imageUrl) || imageUrl}
                            alt=""
                            style={{
                              width: 16, height: 16, minWidth: 16, minHeight: 16,
                              borderRadius: 3, objectFit: "cover", flexShrink: 0,
                              transform: "rotate(-6deg)", border: "1px solid rgba(255,255,255,0.15)",
                            }}
                          />
                          <span style={{ fontStyle: text ? "normal" : "italic", opacity: text ? 1 : 0.75 }}>
                            {text || t("messagesPage.imageOnly")}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <div style={{
                    minWidth: 17, height: 17, borderRadius: 9, background: v2.teal, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9.5, fontWeight: 700, color: "#062018", padding: "0 5px",
                  }}>
                    {c.unread_count}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <PageShell fixedHeight>
      <Header titleKey="page.messages.title" icon={<Mail size={15} />} color={ACCENT} />
      <PageContent noPadding overflow="hidden" style={{ flex: "1 1 0%" }}>
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="meridian-grid-bg" />
          <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
            <ResizableLayout
              accent={ACCENT}
              backLabel={t("messagesPage.backLabel")}
              showRight={!!selectedUsername}
              onBack={() => router.push("/messages")}
              left={list}
              right={selectedUsername ? <DetailPanel accent={ACCENT}>{children}</DetailPanel> : <DetailPanelEmpty accent={ACCENT} />}
            />
          </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
