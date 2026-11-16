"use client"
import { useEffect, useCallback } from "react"
import { useStore } from "@/lib/store"
import { api } from "@/lib/api"
import { STRINGS } from "./strings"
import { loadTranslationsChunked, dropUntranslated, type EnsureReply } from "./chunked-loader"
import { uiCacheKey, dynCacheKey } from "./cache-keys"
import { migrateLegacyCaches } from "./cache-migrate"

// Словарь уходит на перевод пачками по CHUNK_SIZE ключей, ПОСЛЕДОВАТЕЛЬНО: локальная модель
// отвечает по очереди, и параллельные запросы раньше упирались в таймаут (18 пачек — 3
// успевали), а nginx на проде обрывает запрос через 60 с. Пачка из 30 строк — около 15–20 с.
// Результат мержится в state по мере готовности КАЖДОЙ пачки, интерфейс переводится
// постепенно. Строки, которые сервер не смог перевести (поле missing), повторяются и в
// кэш не попадают — русский оригинал никогда не сохраняется как «перевод».
const CHUNK_SIZE = 30

export function useTranslationsLoader() {
  const locale = useStore(s => s.locale)
  const setTranslations = useStore(s => s.setTranslations)
  const mergeDynamicTranslations = useStore(s => s.mergeDynamicTranslations)

  useEffect(() => {
    if (locale === "ru") {
      setTranslations({})
      return
    }

    // Кэш прежнего формата (без версии) не выбрасываем целиком: хорошие переводы переносятся в v2,
    // «отравленные» (русский оригинал вместо перевода) отбрасываются.
    if (typeof window !== "undefined") migrateLegacyCaches(locale, STRINGS)

    const cacheKey = uiCacheKey(locale)
    let baseline: Record<string, string> = {}
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null
    if (cached && cached !== "undefined") {
      try {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed === "object") {
          baseline = dropUntranslated(parsed, STRINGS)
          setTranslations(baseline)
        }
      } catch {
        localStorage.removeItem(cacheKey)
      }
    }

    // Гидратация кэша динамических переводов (useDynamicT) — чтобы уже готовый перевод
    // был виден сразу после загрузки, без ожидания сети.
    const dynKey = dynCacheKey(locale)
    const dynCached = typeof window !== "undefined" ? localStorage.getItem(dynKey) : null
    if (dynCached && dynCached !== "undefined") {
      try {
        const parsed = JSON.parse(dynCached)
        if (parsed && typeof parsed === "object") mergeDynamicTranslations(parsed)
      } catch {
        localStorage.removeItem(dynKey)
      }
    }

    // cancelled: смена языка или размонтирование. Раньше запоздавший ответ прежнего языка
    // мог перетереть перевод нового.
    let cancelled = false
    loadTranslationsChunked({
      strings: STRINGS,
      chunkSize: CHUNK_SIZE,
      concurrency: 1,
      retries: 2,
      shouldStop: () => cancelled,
      post: chunk =>
        api.post(`/api/v1/i18n/ensure/${locale}`, { strings: chunk }).then(resp => resp.data as EnsureReply),
      onChunk: partial => {
        if (!cancelled) setTranslations(prev => ({ ...baseline, ...prev, ...partial }))
      },
    }).then(finalDict => {
      if (cancelled) return
      const complete = { ...baseline, ...finalDict }
      setTranslations(complete)
      if (typeof window !== "undefined") localStorage.setItem(cacheKey, JSON.stringify(complete))
    }).catch(err => {
      console.error("Не удалось загрузить переводы:", err)
    })

    return () => { cancelled = true }
  }, [locale, setTranslations, mergeDynamicTranslations])
}

export function useT() {
  const locale = useStore(s => s.locale)
  const translations = useStore(s => s.translations) ?? {}
  return useCallback((key: string, vars?: Record<string, string | number>) => {
    const base = locale === "ru" ? STRINGS[key] : (translations[key] ?? STRINGS[key] ?? key)
    if (!vars) return base
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      base,
    )
  }, [locale, translations])
}
