"use client"
import { askConfirmText } from "@/lib/confirm"
import React, { useState } from "react"
import { Pencil, X } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface EditDeleteActionsProps {
  onEdit?: () => void
  onDelete?: () => void
  deleteConfirmText?: string
  /** Показывать блок (обычно hov || isActive) */
  visible: boolean
}

const BASE = "#b4b9d2"

// Цвет и фон зависят от состояния React, а не от ручной записи style.color в обработчиках наведения:
// раньше при уходе курсора цвет возвращался к другому значению, чем исходное.
function IconButton({ label, hoverColor, onClick, children }: {
  label: string; hoverColor: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        borderRadius: 8, border: "1px solid #323855", cursor: "pointer",
        background: hover ? "#1e2236" : "rgba(255,255,255,0.05)", color: hover ? hoverColor : BASE,
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {children}
    </button>
  )
}

/**
 * Единый блок действий "изменить / удалить" в списках сущностей.
 * Используется в Гипотезах, Наблюдениях, Прогнозах, Убеждениях, Вопросах, Задачах.
 */
export function EditDeleteActions({ onEdit, onDelete, deleteConfirmText, visible }: EditDeleteActionsProps) {
  const t = useT()
  if (!visible || (!onEdit && !onDelete)) return null
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {onEdit && (
        <IconButton label={t("actions.edit")} hoverColor="#ffffff" onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit() }}>
          <Pencil size={14} />
        </IconButton>
      )}
      {onDelete && (
        <IconButton label={t("actions.deleteLabel")} hoverColor="#E74C3C"
          onClick={async e => { e.preventDefault(); e.stopPropagation(); if (await askConfirmText(deleteConfirmText ?? t("actions.deleteConfirm"))) onDelete() }}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  )
}
