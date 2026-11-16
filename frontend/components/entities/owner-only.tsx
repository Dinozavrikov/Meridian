"use client"
import { ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"

interface OwnerOnlyProps {
  isOwner: boolean
  children: ReactNode
  // "edit" — подпись про редактирование ("Редактировать может только автор
  // записи"), "add" — подпись про добавление ("Добавлять может только
  // автор записи"). Не показывать фолбэк вовсе — placeholder=null.
  fallback?: "edit" | "add" | null
}

// Единая обёртка для действий, доступных только владельцу сущности (линки,
// задачи, источники, изображения и т.п.) — устраняет дублирование
// `isOwner ? <Button/> : <span>...</span>` в каждом отдельном табе/панели.
export function OwnerOnly({ isOwner, children, fallback = "add" }: OwnerOnlyProps) {
  const t = useT()
  if (isOwner) return <>{children}</>
  if (fallback === null) return null
  return (
    <span style={{ fontSize: 11, color: "#9295a5" }}>
      {fallback === "edit" ? t("ownership.editOwnerOnly") : t("ownership.addOwnerOnly")}
    </span>
  )
}
