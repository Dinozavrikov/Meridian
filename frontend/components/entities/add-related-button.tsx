"use client"
// frontend/components/entities/add-related-button.tsx
//
// Единая кнопка "Добавить" внутри таба конкретного типа (Наблюдения/
// Прогнозы/Убеждения/Задачи). Плоское меню из двух пунктов — тип уже
// известен из контекста таба, поэтому не спрашиваем его повторно.
// Сознательно НЕ используем каскадные подменю (см. обсуждение —
// плохо работают на touch-устройствах).
import { Plus, Link2 } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useT } from "@/lib/i18n/useT"
import { ADD_BUTTON_STYLE, addButtonHoverOn, addButtonHoverOff } from "@/components/entities/add-button-style"

interface AddRelatedButtonProps {
  // Текст самой кнопки-триггера ДО клика — должен называть тип
  // добавляемой сущности явно (см. обсуждение: понятность важнее
  // компактности). Раньше был жёстко "Добавить" для всех типов.
  triggerLabel: string
  createLabel: string
  linkLabel: string
  onCreateSelect: () => void
  onLinkSelect: () => void
  // Привязка/создание связанных записей требует входа (не обязательно
  // владения самой сущностью — см. backend/app/api/v1/graph.py add_link,
  // там достаточно прав на просмотр). Гость видит подпись вместо меню.
  isGuest?: boolean
}

export function AddRelatedButton({ triggerLabel, createLabel, linkLabel, onCreateSelect, onLinkSelect, isGuest = false }: AddRelatedButtonProps) {
  const t = useT()

  if (isGuest) {
    return <span style={{ fontSize: 11, color: "#9295a5" }}>{t("ownership.addLoginRequired")}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={ADD_BUTTON_STYLE}
          onMouseEnter={addButtonHoverOn}
          onMouseLeave={addButtonHoverOff}
        >
          <Plus size={11} /> {triggerLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onCreateSelect} icon={<Plus size={13} style={{ color: "#4A90D9" }} />}>
          {createLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLinkSelect} icon={<Link2 size={13} style={{ color: "#9898bb" }} />}>
          {linkLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
