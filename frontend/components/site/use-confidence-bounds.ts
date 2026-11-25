"use client"
import { useMaturityModel } from "@/lib/maturity-model"
import { confidenceBounds, type ConfidenceBounds } from "@/lib/site/sandbox"

/** Границы ползунка уверенности и его начальное положение из модели на сервере (единый источник). Пока модель едет, null. */
export function useConfidenceBounds(): ConfidenceBounds | null {
  const { data } = useMaturityModel()
  return confidenceBounds(data)
}
