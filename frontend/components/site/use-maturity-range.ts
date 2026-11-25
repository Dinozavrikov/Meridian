"use client"
import { useStore } from "@/lib/store"
import { fmtNumber, useMaturityModel } from "@/lib/maturity-model"

export interface MaturityRange { min: string; max: string; minN: number; maxN: number }

/** Границы шкалы зрелости из модели на сервере (единый источник). Пока модель едет, возвращает null. */
export function useMaturityRange(): MaturityRange | null {
  const locale = useStore(s => s.locale) as string
  const { data } = useMaturityModel()
  if (!data) return null
  const { min, max } = data.levels
  return { min: fmtNumber(min, locale, 0), max: fmtNumber(max, locale, 0), minN: min, maxN: max }
}
