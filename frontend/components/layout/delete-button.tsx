"use client"
import { askConfirmText } from "@/lib/confirm"
import React from "react"

interface DeleteButtonProps {
  /** Текст подтверждения, например "Удалить гипотезу?" */
  confirmText: string
  onDelete: () => void
  /** Показывать кнопку (обычно isActive || isHov) */
  visible: boolean
}

/**
 * Единая кнопка удаления записи в списках сущностей.
 * Используется в Гипотезах, Наблюдениях, Прогнозах, Убеждениях, Вопросах, Задачах.
 */
export function DeleteButton({ confirmText, onDelete, visible }: DeleteButtonProps) {
  if (!visible) return null
  return (
    <button
      onClick={async e => { e.stopPropagation(); if (await askConfirmText(confirmText)) onDelete() }}
      style={{ padding: "2px 5px", border: "none", background: "transparent", color: "#9999a1", cursor: "pointer", borderRadius: 4, flexShrink: 0, fontSize: 14, lineHeight: 1 }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#E74C3C"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#9d9da4"}
    >
      ×
    </button>
  )
}
