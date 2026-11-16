"use client"
import { useEffect } from "react"
import { useQuery, UseQueryOptions } from "@tanstack/react-query"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { useContentT, useListContentTranslation, type ContentTranslateItem } from "@/lib/i18n/useContentT"
import { api } from "@/lib/api"

/**
 * Общий слой "запрос + перевод" — снимает системную проблему, из-за
 * которой перевод сущности работал только на её "родной" странице
 * (/hypotheses, /observations и т.п.), а везде, где та же сущность
 * получается ОТДЕЛЬНЫМ запросом (сайдбар лабы, превью-модалки, вкладки
 * лабы), рендерилась сырым текстом — перевод был приклеен к конкретной
 * точке входа данных, а не к самим данным.
 *
 * Правило API: НИКОГДА не заворачивать перевод в сами api-функции
 * (hypApi.list и т.п.) — это хуки (useContentT/useEffect внутри), а хуки
 * нельзя звать вне React. Поэтому единица переиспользования — не функция
 * API, а этот хук: он и делает useQuery, и переводит результат. Любой
 * компонент, которому нужны эти данные, должен звать ЕГО, а не писать
 * свой useQuery поверх той же api-функции.
 *
 * ownerField пробрасывается в isOwner() — "user_id" по умолчанию,
 * "owner_id" для Lab и т.п. См. lib/ownership.ts.
 */

type TranslateOptions = {
  ownerField?: string
} & Omit<UseQueryOptions<any>, "queryKey" | "queryFn">

export function useTranslatedListQuery<T extends { id: number }>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T[]>,
  entityType: string,
  fields: string[],
  options?: TranslateOptions,
) {
  const { ownerField, ...queryOptions } = options ?? {}
  const user = useStore(s => s.user)
  const { data: items = [], ...rest } = useQuery({ queryKey, queryFn, ...queryOptions })

  const tField = useListContentTranslation(
    entityType,
    items,
    fields,
    (item: any) => isOwner(user, item, ownerField),
  )

  const translated = items.map((item: any) => {
    const patch: Record<string, any> = {}
    for (const f of fields) patch[f] = tField(item, f, item[f])
    return { ...item, ...patch }
  })

  return { data: translated, ...rest }
}

export function useTranslatedEntityQuery<T extends { id: number }>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  entityType: string,
  fields: string[],
  options?: TranslateOptions,
) {
  const { ownerField, ...queryOptions } = options ?? {}
  const user = useStore(s => s.user)
  const { data: entity, ...rest } = useQuery({ queryKey, queryFn, ...queryOptions })

  const skip = !entity || isOwner(user, entity, ownerField)
  const { ct, ensure } = useContentT()

  useEffect(() => {
    if (skip || !entity) return
    const toEnsure = fields
      .filter(f => (entity as any)[f])
      .map(f => ({ entityType, entityId: (entity as any).id, field: f, text: (entity as any)[f] }))
    ensure(toEnsure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, entity, entityType, fields.join(",")])

  let translated: T | undefined = entity
  if (entity && !skip) {
    const patch: Record<string, any> = {}
    for (const f of fields) {
      const raw = (entity as any)[f]
      patch[f] = raw ? ct(entityType, (entity as any).id, f, raw) : raw
    }
    translated = { ...entity, ...patch }
  }

  return { data: translated, ...rest }
}


/**
 * Специализация под /api/v1/graph/related/{type}/{id} — ответ там не
 * плоский список, а { related: { <entity_type>: [...] } }, сгруппированный
 * по типу. useTranslatedListQuery/useListContentTranslation рассчитаны на
 * один entityType на весь список, здесь типов несколько сразу — поэтому
 * отдельная реализация, а не переиспользование той функции с одним типом.
 *
 * Владение определяется через is_own, который отдаёт сам /graph/related
 * (бэкенд знает user_id узла и текущего юзера — фронту незачем тащить
 * дополнительные поля ради isOwner()).
 */
export function useTranslatedRelated(
  entityType: string,
  entityId: number,
  options?: Omit<UseQueryOptions<any>, "queryKey" | "queryFn">,
) {
  const { data, ...rest } = useQuery({
    queryKey: ["related", entityType, entityId],
    queryFn: () => api.get(`/api/v1/graph/related/${entityType}/${entityId}`).then(r => r.data),
    ...options,
  })
  const { ct, ensure } = useContentT()
  const related: Record<string, any[]> = data?.related ?? {}
  // упоминания в тексте (не связи): те же заголовки чужих записей, тот же перевод
  const mentionLists: any[][] = [data?.mentions?.mentions ?? [], data?.mentions?.mentioned_in ?? []]
  const flatKey = [...Object.values(related).flat(), ...mentionLists.flat()].map((i: any) => `${i.type}:${i.id}`).join(",")

  useEffect(() => {
    const items: ContentTranslateItem[] = []
    for (const arr of [...Object.values(related), ...mentionLists]) {
      for (const item of arr) {
        if (!item.is_own && item.title) {
          items.push({ entityType: item.type, entityId: item.id, field: "title", text: item.title })
        }
      }
    }
    ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatKey])

  const tr = (item: any) => item.is_own ? item : { ...item, title: ct(item.type, item.id, "title", item.title) }
  const translatedRelated: Record<string, any[]> = {}
  for (const [type, arr] of Object.entries(related)) {
    translatedRelated[type] = arr.map(tr)
  }
  const translatedMentions = data?.mentions
    ? { ...data.mentions, mentions: mentionLists[0].map(tr), mentioned_in: mentionLists[1].map(tr) }
    : undefined

  return { data: data ? { ...data, related: translatedRelated, ...(translatedMentions ? { mentions: translatedMentions } : {}) } : data, ...rest }
}
