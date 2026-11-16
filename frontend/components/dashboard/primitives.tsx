"use client"
import type { CSSProperties, ReactNode } from "react"
import Link from "next/link"
import { v2 } from "@/lib/theme"

export function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, color: v2.t2, marginBottom: 10 }}>
      {children}
    </div>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: v2.surf2, border: `0.5px solid ${v2.bd}`,
      borderRadius: 9, padding: 14, ...style,
    }}>{children}</div>
  )
}

export function SectionHeader({ label, count, accent }: { label: string; count?: number; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent ?? v2.teal, flexShrink: 0 }} />
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: v2.t1, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "#ffffff14" }} />
      {count !== undefined && count > 0 && (
        <div style={{ fontFamily: v2.fontMono, fontSize: 10, fontWeight: 600, color: v2.teal, background: `${v2.teal}18`, border: `0.5px solid ${v2.teal}40`, borderRadius: 5, padding: "2px 7px" }}>{count}</div>
      )}
    </div>
  )
}

/**
 * Пустое состояние — не техническая заглушка "Нет данных", а приглашение
 * к первому действию. Используется во всех блоках дашборда, чтобы страница
 * нового пользователя выглядела осмысленно, а не как руины.
 */
export function EmptyState({
  icon, title, body, actionLabel, actionHref, onAction,
}: { icon?: ReactNode; title: string; body?: string; actionLabel?: string; actionHref?: string; onAction?: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      padding: "22px 12px", textAlign: "center",
    }}>
      {icon && (
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: v2.bg,
          border: `0.5px solid ${v2.bd}`, display: "flex", alignItems: "center",
          justifyContent: "center", color: v2.t3,
        }}>{icon}</div>
      )}
      <div style={{ fontSize: 12, color: v2.t2, lineHeight: 1.5, maxWidth: 240 }}>{title}</div>
      {body && (
        <div style={{ fontSize: 12, color: v2.t2, lineHeight: 1.6, maxWidth: 320, textAlign: "left" }}>{body}</div>
      )}
      {actionLabel && actionHref && (
        <Link href={actionHref} style={{
          fontSize: 11.5, color: v2.teal, border: "0.5px solid rgba(77,207,166,0.35)",
          borderRadius: 7, padding: "5px 12px", background: "rgba(77,207,166,0.08)",
        }}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button onClick={onAction} style={{
          fontSize: 11.5, color: v2.teal, border: "0.5px solid rgba(77,207,166,0.35)",
          borderRadius: 7, padding: "5px 12px", background: "rgba(77,207,166,0.08)",
          cursor: "pointer",
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

