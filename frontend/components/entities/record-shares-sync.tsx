"use client"
// Любая успешная мутация могла создать или убрать связь, снять согласие, сменить видимость: активные «Кому открыто» перечитываются.
// Без этого сегмент доступа в паспорте показывал старое до перезагрузки страницы.
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

export function RecordSharesSync() {
  const qc = useQueryClient()
  useEffect(() => qc.getMutationCache().subscribe(ev => {
    if (ev.type === "updated" && ev.action.type === "success") void qc.invalidateQueries({ queryKey: ["record-shares"] })
  }), [qc])
  return null
}
