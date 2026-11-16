"use client"
import React from "react"
import { theme, ink } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"

/** Хук пагинации: держит page/setPage и режет массив на страницы. */
export function usePagination<T>(items: T[], pageSize = 6) {
  const [page, setPage] = React.useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const pageSafe = Math.min(page, pageCount - 1)
  const paged = items.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize)
  return { page: pageSafe, setPage, pageCount, paged, pageSize }
}

interface PaginationBarProps {
  total: number
  page: number
  pageSize: number
  pageCount: number
  onPageChange: (p: number) => void
}

// Недоступная кнопка гасится цветом, а не прозрачностью: прозрачность роняет контраст ниже читаемого.
const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: 8, border: "1px solid #323855",
  background: disabled ? "transparent" : "#141829", color: disabled ? "#9095b0" : "#e2e0db",
  cursor: disabled ? "default" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 16, lineHeight: 1, transition: "all 0.12s",
})

/** Строка "X–Y из Z" + кнопки листания. Общий вид для всех страниц-списков сущностей. */
export function PaginationBar({ total, page, pageSize, pageCount, onPageChange }: PaginationBarProps) {
  const t = useT()
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px" }}>
      <span style={{ fontFamily: theme.mono, fontSize: 12, color: ink.label, letterSpacing: "0.02em" }}>
        {total > 0
          ? t("pagination.range", { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, total), total })
          : "0"}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}
          aria-label={t("pagination.prev")} style={btnStyle(page === 0)}>
          ‹
        </button>
        <button onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}
          aria-label={t("pagination.next")} style={btnStyle(page >= pageCount - 1)}>
          ›
        </button>
      </div>
    </div>
  )
}
