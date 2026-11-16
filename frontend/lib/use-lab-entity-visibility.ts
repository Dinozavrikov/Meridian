"use client"
// Какой видимости будет запись, созданная в лаборатории: по публичности лабы (как на бэкенде,
// visibility_from_lab). null — пока неизвестно (нет лаборатории в списке «моих» или в ней нет is_public).
import { useMyLabs } from "@/lib/use-my-labs"
import { visibilityFromLab } from "@/lib/lab-lock"

export function useLabEntityVisibility(labId?: number | null): "public" | "lab" | null {
  const { data: labs = [] } = useMyLabs(labId != null)
  if (labId == null) return null
  const lab = (labs as any[]).find(l => l.id === labId)
  return typeof lab?.is_public === "boolean" ? visibilityFromLab(lab.is_public) : null
}
