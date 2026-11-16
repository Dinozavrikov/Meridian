"use client"
// Текст ошибки мутации для показа внутри формы (null — ошибки нет). Тот же шаблон
// (errors.requestFailed), что уже использовался точечно, теперь один на все формы.
import { useT } from "@/lib/i18n/useT"
import { apiErrorMessage } from "@/lib/api-error"

export function useMutationErrorText() {
  const t = useT()
  return (e: unknown): string | null => {
    if (!e) return null
    const message = apiErrorMessage(e, t("errors.unknown"), t("errors.invalidInput"))
    return t("errors.requestFailed", { message }) ?? message
  }
}
