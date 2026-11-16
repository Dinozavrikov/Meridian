"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { buildTrashConfirmText } from "@/lib/trash-confirm"
import type { EntityType } from "@/lib/entity-routes"

interface Props {
  entityType: EntityType
  entity: any
  remove: (id: number) => Promise<unknown>
  onDone: () => void
}

/** Удаление собственной записи из вкладки лаборатории (в корзину). Текст подтверждения — тот же, что на
 *  страницах сущностей (lib/trash-confirm.ts): для прогноза он напоминает, что тот останется в калибровке. */
export function LabDeleteButton({ entityType, entity, remove, onDone }: Props) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const del = useMutation({
    mutationFn: () => remove(entity.id),
    onMutate: () => setFailed(false),
    onSuccess: () => onDone(),
    onError: () => setFailed(true),
  })
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
      {failed && <span role="alert" style={{ fontSize: 11, color: v2.red }}>{t("labTabs.deleteError")}</span>}
      <button type="button" aria-label={t("labTabs.deleteAria")} title={t("labTabs.deleteAria")} disabled={del.isPending}
        onClick={async e => { e.stopPropagation(); if (await askConfirmText(buildTrashConfirmText(t, entityType, entity))) del.mutate() }}
        onMouseEnter={e => { e.currentTarget.style.color = v2.red }}
        onMouseLeave={e => { e.currentTarget.style.color = v2.t3 }}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6,
          border: "none", background: "transparent", color: v2.t3, cursor: del.isPending ? "default" : "pointer",
          opacity: del.isPending ? 0.5 : 1,
        }}>
        <Trash2 size={13} />
      </button>
    </span>
  )
}
