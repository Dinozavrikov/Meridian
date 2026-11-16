"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useStore } from "@/lib/store"
import { authApi } from "@/lib/api"
import { useUnread, UnreadItem, useUnreadMessages } from "@/lib/use-unread"
import { useState, useRef } from "react"
import { Settings, LogOut } from "lucide-react"
import { v2 } from "@/lib/theme"
import { Tooltip } from "@/components/ui/tooltip"
import { useT } from "@/lib/i18n/useT"
import { entityHref } from "@/lib/entity-routes"
import { NAV_GROUPS, DASHBOARD_ITEM, TRASH_ITEM, isNavActive, restColor, RAIL_WIDTH, SIDEBAR_TILE, SIDEBAR_ICON, type NavItem } from "@/lib/nav"

type SidebarEntry = { sep: true } | NavItem

const NAV: SidebarEntry[] = [
  { sep: true },
  ...NAV_GROUPS.flatMap((g): SidebarEntry[] => [...g.items, { sep: true }]),
  TRASH_ITEM,
]

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <div style={{
      position: "absolute", top: 4, right: 4,
      width: 10, height: 10, borderRadius: "50%",
      background: v2.amber, color: v2.bg,
      fontSize: 7, fontWeight: 700, lineHeight: "10px", textAlign: "center",
    }}>{count > 9 ? "9+" : count}</div>
  )
}

function timeAgo(d: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 3600) return t("time.minutesAgo", { n: Math.floor(s / 60) })
  if (s < 86400) return t("time.hoursAgo", { n: Math.floor(s / 3600) })
  return t("time.daysAgo", { n: Math.floor(s / 86400) })
}

function UnreadDropdown({ items, t }: { items: UnreadItem[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (!items.length) return null
  return (
    <div style={{
      position: "absolute", left: "calc(100% + 8px)", top: 0,
      width: 280, borderRadius: 10,
      background: v2.surf, border: `0.5px solid ${v2.bd2}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      zIndex: 100, overflow: "hidden",
    }}>
      <div style={{ padding: "8px 12px 6px", borderBottom: `0.5px solid ${v2.bd}` }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: v2.t3, textTransform: "uppercase" }}>
          {t("sidebar.newComments")}
        </span>
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {items.map((item, i) => (
          <Link key={i} href={entityHref(item.entity_type as any, item.entity_slug || item.entity_id)} style={{ textDecoration: "none" }}>
            <div style={{ padding: "10px 12px", borderBottom: `0.5px solid ${v2.bd}`, cursor: "pointer", transition: "background 0.12s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v2.surf2}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: v2.t2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  {item.entity_title || `${item.entity_type} #${item.entity_id}`}
                </span>
                <span style={{ fontSize: 10, color: v2.t3 }}>{timeAgo(item.last_at, t)}</span>
              </div>
              <p style={{ fontSize: 12, color: v2.t2, margin: 0, lineHeight: 1.5,
                overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as any }}>
                <span style={{ color: v2.t1, fontWeight: 500 }}>{item.last_author}: </span>
                {item.last_content}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SidebarIcon({ item, active, unreadCount, unreadItems, t, label }: {
  item: NavItem; active: boolean; unreadCount: number; unreadItems: UnreadItem[]
  t: (key: string, vars?: Record<string, string | number>) => string; label: string
}) {
  const [hovered, setHovered] = useState(false) // выпадашка непрочитанного (с задержкой закрытия)
  const [hot, setHot] = useState(false)         // подсветка плитки иконки
  const timerRef = useRef<any>(null)
  const enter = () => { clearTimeout(timerRef.current); setHovered(true); setHot(true) }
  const leave = () => { setHot(false); timerRef.current = setTimeout(() => setHovered(false), 200) }
  const c = item.color

  return (
    <div style={{ position: "relative" }} onMouseEnter={enter} onMouseLeave={leave}>
      <Tooltip text={label}>
        <Link href={item.href} style={{ textDecoration: "none" }}>
          <div style={{
            width: SIDEBAR_TILE, height: SIDEBAR_TILE, borderRadius: 9, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", cursor: "pointer",
            background: active ? `${c}26` : hot ? `${c}14` : "transparent",
            transition: "background 0.12s",
          }}>
            {active && (
              // Плитка по центру рейки => её левый край на (RAIL_WIDTH - SIDEBAR_TILE) / 2 от края рейки;
              // отрицательный left ставит полоску вплотную к краю экрана.
              <div style={{
                position: "absolute", left: -(RAIL_WIDTH - SIDEBAR_TILE) / 2, top: "50%", transform: "translateY(-50%)",
                width: 3, height: 18, background: c, borderRadius: "0 3px 3px 0",
                boxShadow: `0 0 8px ${c}80`,
              }} />
            )}
            <item.icon size={SIDEBAR_ICON} strokeWidth={active ? 2.2 : 1.9}
              style={{ color: active || hot ? c : restColor(item), transition: "color 0.12s" }} />
            <Badge count={unreadCount} />
          </div>
        </Link>
      </Tooltip>
      {hovered && unreadItems.length > 0 && <UnreadDropdown items={unreadItems} t={t} />}
    </div>
  )
}

export function Sidebar() {
  const t = useT()
  const pathname = usePathname()
  const { user, setUser } = useStore()
  const { items: unreadItems } = useUnread()
  const { count: unreadMsgCount } = useUnreadMessages()

  const handleLogout = async () => {
    await authApi.logout()
    setUser(null)
    window.location.href = "/feed"
  }

  const getUnread = (key?: string) => {
    if (!key) return { count: 0, items: [] }
    if (key === "messages") return { count: unreadMsgCount, items: [] }
    const filtered = key === "feed"
      ? unreadItems.filter(i => i.entity_type !== "lab")
      : unreadItems.filter(i => i.entity_type === "lab")
    return { count: filtered.reduce((a, i) => a + i.count, 0), items: filtered }
  }

  // Сайдбар виден на любой ширине, пока пользователь залогинен (app-shell не прячет
  // его на мобильном: спейсер там block). Гамбургер в Header (nav-menu.tsx) дублирует
  // навигацию. Для гостей вместо него GuestSidebar.
  return (
    <aside className="flex" style={{
      position: "fixed", top: 0, left: 0, height: "100%", zIndex: 30,
      width: RAIL_WIDTH, flexShrink: 0,
      flexDirection: "column", alignItems: "center",
      background: v2.surf, borderRight: `0.5px solid ${v2.bd}`,
      padding: "10px 0 12px", gap: 2,
    }}>
      <SidebarIcon
        item={DASHBOARD_ITEM}
        active={isNavActive(pathname, DASHBOARD_ITEM.href)}
        unreadCount={0} unreadItems={[]} t={t} label={t("nav.dashboard")}
      />

      {NAV.map((item, i) => {
        if ("sep" in item) {
          return <div key={i} style={{ width: 20, height: 0.5, background: v2.bd, margin: "4px 0", flexShrink: 0 }} />
        }
        const active = isNavActive(pathname, item.href)
        const { count, items: uItems } = getUnread(item.unreadKey)
        return (
          <SidebarIcon key={item.href} item={item} active={active}
            unreadCount={count} unreadItems={uItems} t={t} label={t(item.labelKey)} />
        )
      })}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Tooltip text={t("sidebar.settings")}>
          <Link href="/settings" style={{ textDecoration: "none" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, display: "flex",
              alignItems: "center", justifyContent: "center", color: v2.t3, cursor: "pointer",
              transition: "all 0.12s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = v2.t1; (e.currentTarget as HTMLElement).style.background = v2.surf2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = v2.t3; (e.currentTarget as HTMLElement).style.background = "transparent" }}>
              <Settings size={17} />
            </div>
          </Link>
        </Tooltip>
        <Tooltip text={t("sidebar.logout")}>
          <button onClick={handleLogout} style={{
            width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: v2.t3,
            transition: "all 0.12s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = v2.red; (e.currentTarget as HTMLElement).style.background = "rgba(224,91,91,0.08)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = v2.t3; (e.currentTarget as HTMLElement).style.background = "transparent" }}>
            <LogOut size={17} />
          </button>
        </Tooltip>
        {user && (
          <Tooltip text={user.display_name || user.username}>
            <Link href={`/profile/${user.username}`} style={{ textDecoration: "none" }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: "rgba(139,128,240,0.15)", border: `0.5px solid rgba(139,128,240,0.35)`,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: v2.violet }}>
                  {(user.display_name || user.username)[0].toUpperCase()}
                </span>
              </div>
            </Link>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}
