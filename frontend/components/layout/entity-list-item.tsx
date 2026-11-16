"use client"
import React from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { StatusBadge } from "@/components/ui/status-badge"
import { tag, listItemTitle, listItemPreview, listItem } from "@/lib/theme"
import { DateStamp } from "@/components/ui/date-stamp"

interface EntityListItemProps {
  id: number
  isActive: boolean
  accent: string
  onClick: () => void
  /** Дата в любом строковом формате */
  date?: string
  /** Заголовок или основной текст */
  title: string
  /** Полный текст для tooltip и preview */
  fullText?: string
  /** Статус — рендерится через StatusBadge */
  status?: string
  /** Теги */
  tags?: string[]
  /** Активный тег для фильтрации (приглушает остальные) */
  activeTag?: string | null
  onTagClick?: (t: string) => void
  /** Иконка справа (видимость и т.п.) */
  rightIcon?: React.ReactNode
  /** Показатель под статусом (шкала значимости, зрелости и т.п.) */
  progressBar?: React.ReactNode
  /** Показывать строку превью текста (по умолчанию true) */
  showPreview?: boolean
  /** Доп. контент в одной строке со статусом (например, дедлайн у прогнозов) */
  statusExtra?: React.ReactNode
  /** Удаление записи (если передано - показывается кнопка × при hover/active) */
  onDelete?: () => void
  deleteConfirmText?: string
  onEdit?: () => void
}

/**
 * Единый элемент списка для всех страниц сущностей.
 * Используется в Наблюдениях, Гипотезах и любых будущих страницах.
 */
export function EntityListItem({
  isActive, accent, onClick,
  date, title, fullText, status,
  tags, activeTag, onTagClick,
  rightIcon, progressBar, onDelete, deleteConfirmText, onEdit, statusExtra, showPreview = true,
}: EntityListItemProps) {
  const [hov, setHov] = React.useState(false)
  // На тач-устройствах hover никогда не станет true — кнопки должны быть
  // видны сразу, без ожидания наведения (как уже сделано в feed-card.tsx).
  const isMobile = useIsMobile()

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick() } }}
      style={listItem(isActive, hov, accent)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            {date && <DateStamp raw={date} />}
            {rightIcon}
          </div>

          <Tooltip text={fullText || title}>
            <div style={listItemTitle(isActive)}>{title}</div>
          </Tooltip>

          {showPreview && fullText && title && (
            <Tooltip text={fullText}>
              <div style={{ ...listItemPreview(), marginBottom: (tags?.length || status) ? 6 : 0 }}>
                {fullText.slice(0, 60)}
              </div>
            </Tooltip>
          )}

          {(status || tags?.length) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {status && <StatusBadge status={status} />}
              {statusExtra}
              {tags?.map(t => (
                <span key={t}
                  onClick={e => { e.stopPropagation(); onTagClick?.(t) }}
                  style={{ ...tag(accent), cursor: "pointer", opacity: activeTag && activeTag !== t ? 0.4 : 1 }}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {progressBar && <div style={{ marginTop: 10 }}>{progressBar}</div>}
        </div>
        {(onDelete || onEdit) && (
          <EditDeleteActions visible={isActive || hov || isMobile} onEdit={onEdit} onDelete={onDelete} deleteConfirmText={deleteConfirmText} />
        )}
      </div>
    </div>
  )
}
