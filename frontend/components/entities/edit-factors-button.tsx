"use client"
import { SlidersHorizontal } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ActionButton } from "@/components/ui/action-button"

/** «Изменить факторы»: одна кнопка для всех страниц сущностей, того же вида, что остальные действия. */
export function EditFactorsButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useT()
  return <ActionButton icon={<SlidersHorizontal size={14} />} disabled={disabled} onClick={onClick}>{t("editFactorsButton.label")}</ActionButton>
}
