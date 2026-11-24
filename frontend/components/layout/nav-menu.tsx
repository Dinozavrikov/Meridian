"use client"
import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { ChevronDown, Menu, X } from "lucide-react"
import { v2 } from "@/lib/theme"
import { DASHBOARD_ITEM, ABOUT_ITEM, HEADER_GROUPS, isNavActive, restColor, MENU_TILE, MENU_ICON, type NavGroup, type NavItem } from "@/lib/nav"

type T = (key: string) => string

function CountBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <span style={{
      minWidth: 15, height: 15, padding: "0 4px", borderRadius: 7.5,
      background: v2.amber, color: v2.bg, fontSize: 9, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{n > 9 ? "9+" : n}</span>
  )
}

// Одна строка меню: цветная плитка с иконкой + подпись (+ счётчик).
// Общая для выпадашек и мобильного меню, чтобы выглядели одинаково.
export function NavRow({ item, active, count = 0, t, onClick }: {
  item: NavItem; active: boolean; count?: number; t: T; onClick?: () => void
}) {
  const [hot, setHot] = useState(false)
  const c = item.color
  return (
    <Link href={item.href} style={{ textDecoration: "none" }} onClick={onClick}>
      <div
        onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        style={{
          position: "relative", display: "flex", alignItems: "center", gap: 10,
          padding: "6px 8px", borderRadius: 8, cursor: "pointer",
          background: active ? `${c}14` : hot ? v2.surf2 : "transparent",
          transition: "background 0.1s",
        }}
      >
        {active && (
          <div style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 2, borderRadius: 2, background: c }} />
        )}
        <div style={{
          width: MENU_TILE, height: MENU_TILE, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? `${c}2e` : hot ? `${c}1f` : "rgba(255,255,255,0.04)",
          transition: "background 0.1s",
        }}>
          <item.icon size={MENU_ICON} style={{ color: active || hot ? c : restColor(item), transition: "color 0.1s" }} />
        </div>
        <span style={{
          fontSize: 12.5, flex: 1, color: active || hot ? v2.t1 : v2.t2,
          fontWeight: active ? 600 : 400,
        }}>{t(item.labelKey)}</span>
        <CountBadge n={count} />
      </div>
    </Link>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.09em", color: v2.t3, padding: "4px 8px 6px" }}>
      {children}
    </div>
  )
}

function RowDivider() {
  return <div style={{ height: 0.5, background: v2.bd2, margin: "5px 6px" }} />
}

// ── NavFlyout ────────────────────────────────────────────────────────────
// Управляется родителем (Header): open/onEnter/onLeave приходят снаружи,
// чтобы у всех групп меню был ОДИН общий таймер закрытия. Иначе при переходе
// мышью из одной группы в другую возникает гонка: старая группа ещё не
// закрылась по таймеру, а новая уже открылась — на миг видно обе сразу.
export function NavFlyout({ group, pathname, open, onEnter, onLeave, badgeCounts, t }: {
  group: NavGroup; pathname: string
  open: boolean; onEnter: () => void; onLeave: () => void
  badgeCounts?: Record<string, number>
  t: T
}) {
  const isActiveGroup = group.items.some(i => isNavActive(pathname, i.href))
  const groupTotal = group.items.reduce((a, i) => a + (badgeCounts?.[i.href] ?? 0), 0)

  return (
    <div style={{ position: "relative" }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: isActiveGroup ? 600 : 400,
        color: open || isActiveGroup ? v2.t1 : v2.t3,
        padding: "5px 10px", borderRadius: 7, cursor: "pointer",
        background: open ? v2.surf2 : isActiveGroup ? "rgba(255,255,255,0.04)" : "transparent",
        userSelect: "none", transition: "color 0.12s, background 0.12s",
      }}>
        {t(group.labelKey)}
        {groupTotal > 0 && (
          <span style={{
            minWidth: 14, height: 14, padding: "0 3px", borderRadius: 7,
            background: v2.amber, color: v2.bg, fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{groupTotal > 9 ? "9+" : groupTotal}</span>
        )}
        <ChevronDown size={11} style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }} />
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0,
          background: v2.surf, border: `0.5px solid ${v2.bd2}`,
          borderRadius: 12, padding: 6, minWidth: 220, zIndex: 200,
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        }}>
          <GroupLabel>{t(group.labelKey)}</GroupLabel>
          {group.items.map(item => (
            <React.Fragment key={item.href}>
              {item.dividerBefore && <RowDivider />}
              <NavRow item={item} active={isNavActive(pathname, item.href)}
                count={badgeCounts?.[item.href] ?? 0} t={t} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export function MobileNav({ pathname, t }: { pathname: string; t: T }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, height: 30, borderRadius: 7, border: "none",
          background: open ? v2.surf2 : "transparent", color: v2.t1,
          cursor: "pointer",
        }}
        aria-label={t("header.mobileMenuAria")}
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          background: v2.surf, border: `0.5px solid ${v2.bd2}`,
          borderRadius: 12, padding: 8, minWidth: 220, zIndex: 200,
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          maxHeight: "70vh", overflowY: "auto",
        }}>
          <NavRow item={DASHBOARD_ITEM} active={isNavActive(pathname, DASHBOARD_ITEM.href)}
            t={t} onClick={() => setOpen(false)} />
          {HEADER_GROUPS.map(group => (
            <div key={group.id} style={{ marginTop: 6 }}>
              <GroupLabel>{t(group.labelKey)}</GroupLabel>
              {group.items.map(item => (
                <React.Fragment key={item.href}>
                  {item.dividerBefore && <RowDivider />}
                  <NavRow item={item} active={isNavActive(pathname, item.href)}
                    t={t} onClick={() => setOpen(false)} />
                </React.Fragment>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 6 }}>
            <NavRow item={ABOUT_ITEM} active={isNavActive(pathname, ABOUT_ITEM.href)}
              t={t} onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
