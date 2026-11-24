"use client"
import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useStore } from "@/lib/store"
import { useUnreadMessages } from "@/lib/use-unread"
import { useQuestionAnswerPending } from "@/lib/use-question-answers"
import { useT } from "@/lib/i18n/useT"
import { LocaleSwitcher } from "./locale-switcher"
import { ContradictionsBell } from "./contradictions-bell"
import { NavFlyout, MobileNav } from "./nav-menu"
import { HEADER_GROUPS } from "@/lib/nav"
import { Search } from "lucide-react"
import { useIsMobile } from "./resizable-layout"
import { pageHeaderTitle, pageHeaderIcon, v2 } from "@/lib/theme"

interface HeaderProps {
  // Статичный заголовок страницы — резолвится через t() внутри Header.
  // Используй titleKey для любого текста, который придумывает код (не пользователь).
  titleKey?: string
  // Сырой заголовок как есть, БЕЗ перевода — для пользовательского контента
  // (например title={lab.name}) или если titleKey ещё не заведён.
  title?: string
  actions?: React.ReactNode
  color?: string
  icon?: React.ReactNode
}

export function Header({ titleKey, title: rawTitle, actions, color = "#4A90D9", icon }: HeaderProps) {
  const { setSearchOpen, user } = useStore()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { count: unreadMsgCount } = useUnreadMessages()
  const { total: pendingAnswersCount } = useQuestionAnswerPending()
  const badgeCounts = { "/messages": unreadMsgCount, "/questions": pendingAnswersCount }
  const t = useT()

  const title = titleKey ? t(titleKey) : (rawTitle ?? "")

  useEffect(() => {
    document.title = title ? `${title} · Meridian` : "Meridian"
  }, [title])

  // Один общий таймер закрытия на все группы меню — гарантирует, что
  // открыта максимум одна группа за раз, без гонки состояний.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const closeTimer = useRef<any>(null)
  const openNow = (key: string) => { clearTimeout(closeTimer.current); setOpenGroup(key) }
  const scheduleClose = () => { closeTimer.current = setTimeout(() => setOpenGroup(null), 150) }

  // MOBILE FIX: раньше перенос второго блока (поиск/локаль/actions) держался
  // на flexWrap внутри одной строки-row + flexBasis:100% у правого блока.
  // Это ненадёжно: у левого блока flex:1 => flex-basis:0, а решение "переносить
  // или нет" flexbox принимает по гипотетическим базовым размерам ДО сжатия —
  // из-за этого перенос срабатывал по-разному в зависимости от длины
  // заголовка на разных страницах (Прогнозы переносились, Вопросы — нет).
  // Теперь на мобильном шапка явно (детерминированно) переключается в
  // колонку — без надежды на то, как браузер решит расположить flex-строку.
  return (
    <header style={{
      minHeight: 52, borderBottom: `1px solid rgba(255,255,255,0.1)`,
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "space-between",
      gap: isMobile ? 6 : 0,
      padding: "8px 20px", background: v2.surf,
      position: "sticky", top: 0, zIndex: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: isMobile ? "0 0 auto" : 1 }}>
        {isMobile && <MobileNav pathname={pathname} t={t} />}
        {!isMobile && (
          <Link href={user ? "/dashboard" : "/"} style={{
            textDecoration: "none", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
            color: v2.t1, marginRight: 18, flexShrink: 0, userSelect: "none",
          }}>
            MER<span style={{ color: v2.teal }}>I</span>DIAN
          </Link>
        )}
        {!isMobile && <div style={{ width: 0.5, height: 18, background: v2.bd, marginRight: 14, flexShrink: 0 }} />}
        <div style={{
          ...pageHeaderTitle(), marginRight: 14, minWidth: 0,
          // На десктопе заголовок делит строку с группами навигации
          // (Data/Analysis/Community) — там ellipsis нужен, чтобы длинный
          // заголовок их не вытеснял. На мобильном той конкуренции нет
          // (группы скрыты), и обрезание там только мешает — даём
          // заголовку перенестись на свою строку целиком.
          overflow: isMobile ? "visible" : "hidden",
          textOverflow: isMobile ? "clip" : "ellipsis",
          whiteSpace: isMobile ? "normal" : "nowrap",
        }}>
          {icon && <div style={pageHeaderIcon(color)}>{icon}</div>}
          <span>{title}</span>
        </div>
        {!isMobile && (
          <>
            {HEADER_GROUPS.map(g => (
              <NavFlyout key={g.id} group={g} pathname={pathname} t={t}
                open={openGroup === g.id} onEnter={() => openNow(g.id)} onLeave={scheduleClose}
                badgeCounts={badgeCounts} />
            ))}
          </>
        )}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        flexWrap: "wrap", justifyContent: isMobile ? "space-between" : "flex-end", rowGap: 6,
      }}>
        <button
          onClick={() => setSearchOpen(true)}
          aria-label={t("header.search")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: v2.bg, border: `0.5px solid ${v2.bd2}`,
            borderRadius: 8, padding: isMobile ? "6px 8px" : "6px 12px", color: v2.t3,
            fontSize: 13, cursor: "pointer", transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(77,207,166,0.4)"; (e.currentTarget as HTMLElement).style.color = v2.t1 }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = v2.bd2; (e.currentTarget as HTMLElement).style.color = v2.t3 }}
        >
          <Search size={14} />
          {/* На мобильном оставляем только иконку — подпись "Search" и
              подсказка "/" полезны только с физической клавиатурой и
              на узком экране просто съедали место, из-за чего остальные
              элементы шапки (бейдж очереди, кнопка "Добавить") обрезались. */}
          {!isMobile && <span>{t("header.search")}</span>}
          {!isMobile && <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: v2.bg, border: `0.5px solid ${v2.bd2}`, color: v2.t3 }}>/</kbd>}
        </button>
        <ContradictionsBell />
        <LocaleSwitcher />
        {actions}
      </div>
    </header>
  )
}
