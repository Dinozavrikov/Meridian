"use client"
import { useEffect, useCallback, useRef } from "react"
import { useStore } from "@/lib/store"
import { api } from "@/lib/api"

/**
 * Второй, независимый от useDynamicT канал перевода — специально для
 * ПОЛЬЗОВАТЕЛЬСКОГО контента (тексты наблюдений/гипотез/комментариев и
 * т.п.), которого useDynamicT явно избегает (см. его докстринг: кэш там
 * ключуется по самому тексту, что не годится для контента — он уникален
 * на запись, переиспользования между записями нет, кэш просто раздувается).
 *
 * Здесь кэш на бэкенде ключуется по (entity_type, entity_id, field, язык) —
 * см. ContentTranslation/ensure-content в i18n.py.
 *
 * Уважает translationScope из стора: активен только когда режим "весь
 * контент" или "только контент" (scope !== "ui") — при "только интерфейс"
 * всегда возвращает исходный текст без единого сетевого запроса.
 *
 * Решение "не переводить свой контент" принимает вызывающая сторона —
 * этот хук ничего не знает про авторство, только переводит то, что ему
 * передали через ensure().
 */

export interface ContentTranslateItem {
  entityType: string
  entityId: number
  field: string
  text: string
}

const BATCH_DELAY_MS = 150
let pendingItems: ContentTranslateItem[] = []
let pendingKeys = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function keyOf(entityType: string, entityId: number, field: string) {
  return `${entityType}:${entityId}:${field}`
}

const CONTENT_CHUNK = 200
const MAX_CONTENT_TEXT = 50_000 // как на сервере (translatable_fields.py); длиннее не переводим

function flush(locale: string, onResult: (dict: Record<string, string>) => void) {
  const items = pendingItems.filter(i => i.text.length <= MAX_CONTENT_TEXT)
  pendingItems = []
  pendingKeys = new Set()
  timer = null
  if (items.length === 0) return

  // Сервер принимает не более 500 пунктов за запрос: режем на пачки, одна неудачная не ломает остальные.
  for (let i = 0; i < items.length; i += CONTENT_CHUNK) {
    api.post(`/api/v1/i18n/ensure-content/${locale}`, {
      items: items.slice(i, i + CONTENT_CHUNK).map(it => ({ entity_type: it.entityType, entity_id: it.entityId, field: it.field, text: it.text })),
    })
      .then(resp => onResult(resp.data.translations as Record<string, string>))
      .catch(err => console.error("Не удалось перевести контент:", err))
  }
}

export function useContentT() {
  const locale = useStore(s => s.locale)
  const scope = useStore(s => s.translationScope)
  const contentTranslations = useStore(s => s.contentTranslations)
  const mergeContentTranslations = useStore(s => s.mergeContentTranslations)
  const resetContentTranslations = useStore(s => s.resetContentTranslations)
  const prevKey = useRef(`${locale}:${scope}`)

  const active = locale !== "ru" && scope !== "ui"

  useEffect(() => {
    const key = `${locale}:${scope}`
    if (prevKey.current !== key) {
      resetContentTranslations()
      prevKey.current = key
    }
  }, [locale, scope, resetContentTranslations])

  const ensure = useCallback((items: ContentTranslateItem[]) => {
    if (!active || items.length === 0) return
    let missing = false
    for (const item of items) {
      if (!item.text) continue
      const k = keyOf(item.entityType, item.entityId, item.field)
      if (!(k in contentTranslations) && !pendingKeys.has(k)) {
        pendingItems.push(item)
        pendingKeys.add(k)
        missing = true
      }
    }
    if (!missing) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => flush(locale, mergeContentTranslations), BATCH_DELAY_MS)
  }, [active, locale, contentTranslations, mergeContentTranslations])

  const ct = useCallback((entityType: string, entityId: number, field: string, fallback: string) => {
    if (!active || !fallback) return fallback
    const k = keyOf(entityType, entityId, field)
    return contentTranslations[k] ?? fallback
  }, [active, contentTranslations])

  return { ct, ensure, active }
}

/**
 * Тонкая обёртка над ensure()+ct() для одного поля одной записи — убирает
 * повторяющийся вызов ensure() в useEffect на каждом месте использования.
 * skip передаёт вызывающий код — это тот же isOwn/isOwner check, что уже
 * используется для кнопок edit/delete (правило "не переводить своё" живёт
 * на фронтенде, у бэкенда его нет — см. докстринг файла).
 */
export function useTranslatedField(entityType: string, entityId: number, field: string, text: string, skip = false) {
  const { ct, ensure } = useContentT()
  useEffect(() => {
    if (skip || !text) return
    ensure([{ entityType, entityId, field, text }])
  }, [entityType, entityId, field, text, skip, ensure])
  if (skip || !text) return text
  return ct(entityType, entityId, field, text)
}

/**
 * Батч-версия для СПИСКОВ (страницы сущностей рендерят EntityListItem
 * инлайново в .map(), а не отдельным компонентом — хук туда вставить
 * нельзя, правила хуков это запрещают). Паттерн взят из feed-card.tsx:
 * ensure() батчится один раз в useEffect на весь видимый список, а ct()
 * — не хук, его можно звать прямо внутри .map() сколько угодно раз.
 *
 * Ключ эффекта — строка id'шников, а не сам массив items: filtered/paged
 * пересоздаются на каждый рендер (новый .filter()), и если положить массив
 * в зависимости как есть, эффект будет дёргаться на каждый чих (ввод в
 * поиске и т.п.) — не критично (ensure сам дедуплицирует через pendingKeys/
 * contentTranslations), но незачем гонять лишние проверки.
 */
export function useListContentTranslation<T extends { id: number }>(
  entityType: string,
  items: T[],
  fields: string[],
  isOwnerFn: (item: T) => boolean,
) {
  const { ct, ensure } = useContentT()
  const idsKey = items.map(i => i.id).join(",")
  useEffect(() => {
    const list: ContentTranslateItem[] = []
    for (const item of items) {
      if (isOwnerFn(item)) continue
      for (const f of fields) {
        const text = (item as any)[f]
        if (text) list.push({ entityType, entityId: item.id, field: f, text })
      }
    }
    ensure(list)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, idsKey])

  return (item: T, field: string, fallback: string) => isOwnerFn(item) ? fallback : ct(entityType, item.id, field, fallback)
}
