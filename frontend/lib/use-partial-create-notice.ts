"use client"
// Возвращает функцию для onSuccess после создания записи: если поздний шаг (связи, картинки)
// не удался — говорит об этом. Запись к этому моменту уже создана, форму закрываем как обычно.
import { useT } from "@/lib/i18n/useT"
import type { PostCreateStep } from "@/lib/partial-create"
import { toast } from "@/lib/toast"

export function usePartialCreateNotice() {
  const t = useT()
  return (created: { _failedSteps?: PostCreateStep[] } | null | undefined) => {
    const failed = created?._failedSteps
    if (!failed?.length) return
    const steps = failed.map(k => t(`errors.partialCreate.${k}`) ?? k).join(", ")
    // предупреждение остаётся на экране (10 с, закрывается крестиком) и не блокирует страницу, как блокировал alert
    toast({ message: t("errors.partialCreate", { steps }) ?? steps, tone: "warn" })
  }
}
