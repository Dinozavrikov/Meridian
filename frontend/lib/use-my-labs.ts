"use client"
import { labApi } from "@/lib/api"
import { useTranslatedListQuery } from "@/lib/i18n/use-translated-query"

/**
 * Единая точка получения "моих лабораторий" (где я owner или member) —
 * раньше было ~15 независимых useQuery(["labs"], ...) по всему фронту плюс
 * два места с queryKey ["labs", "mine"] на тот же самый запрос (feed/page.tsx,
 * destination-picker.tsx) — разный кэш react-query на одни и те же данные,
 * лишние сетевые запросы и риск рассинхрона.
 *
 * Тонкая обёртка над useTranslatedListQuery — лаба ничем архитектурно не
 * отличается от любой другой сущности с пользовательским текстом, только
 * поле владельца называется owner_id, а не user_id (см. lib/ownership.ts).
 */
export function useMyLabs(enabled: boolean = true) {
  return useTranslatedListQuery(
    ["labs"],
    labApi.mine,
    "lab",
    ["name", "description"],
    { enabled, ownerField: "owner_id" },
  )
}
