"use client"
import React from "react"
import { Pencil } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { ink } from "@/lib/theme"
import Link from "next/link"

interface EntityActionsBarProps {
  authorName?: string
  // Username владельца ПРОСМАТРИВАЕМОЙ записи — для ссылки на профиль. Раньше здесь ошибочно
  // брался username ТЕКУЩЕГО зрителя из стора, что вело на чужой профиль. Пусто — ссылка не
  // строится, чип остаётся текстом (автор не связан с профилем).
  authorUsername?: string
  visibilityNode?: React.ReactNode
  onEdit?: () => void
  extra?: React.ReactNode
  accent?: string
}

const chipStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  fontSize: 12, padding: "5px 10px", borderRadius: 8,
  background: "#181B2C", color: ink.label,
  border: "1px solid #262b42", fontWeight: 500,
  textDecoration: "none", whiteSpace: "nowrap",
}

export function EntityActionsBar({
  authorName, authorUsername, visibilityNode, onEdit, extra, accent = "#4A90D9",
}: EntityActionsBarProps) {
  const t = useT()
  const isMobile = useIsMobile()
  const href = authorUsername ? `/profile/${authorUsername}` : null

  return (
    <>
      {authorName && (
        href ? (
          <Link href={href} style={chipStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2e0db"; (e.currentTarget as HTMLElement).style.borderColor = "#3a4062" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ink.label; (e.currentTarget as HTMLElement).style.borderColor = "#262b42" }}
          >
            {authorName}
          </Link>
        ) : (
          <span style={chipStyle}>{authorName}</span>
        )
      )}
      {visibilityNode && <span style={{ display: "flex" }}>{visibilityNode}</span>}
      {extra}
      {onEdit && (
        // Главное действие страницы: заполненная кнопка в цвете типа, а не такой же серый чип, как остальные.
        <button
          onClick={onEdit}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            padding: isMobile ? "9px 16px" : "6px 14px", borderRadius: 8,
            border: `1px solid ${accent}66`, background: `${accent}1f`, color: accent,
            cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = `${accent}33`; el.style.borderColor = accent }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = `${accent}1f`; el.style.borderColor = `${accent}66` }}
        >
          <Pencil size={13} /> {t("actions.edit")}
        </button>
      )}
    </>
  )
}
