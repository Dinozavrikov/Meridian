"use client"
import { useEffect, useCallback, useRef } from "react"
import { useStore } from "@/lib/store"
import { api } from "@/lib/api"
import { dynCacheKey } from "./cache-keys"
import { loadTranslationsChunked, type EnsureReply } from "./chunked-loader"

/**
 * Второй, независимый канал перевода — для рантайм-текста, заданного КОДОМ,
 * а не человеком (например: статусы сущностей, прочие enum-подобные строки).
 *
 * В отличие от useT/STRINGS, здесь НЕТ фиксированного набора ключей: сам
 * переводимый текст одновременно является и ключом кэша. Это осознанно —
 * список статусов сейчас меняется параллельно другим разработчиком, и любой
 * маппинг "статус -> ключ" рассинхронизировался бы. Текст-как-ключ работает
 * с любым набором значений без правок кода перевода:
 *   - новый статус появился -> просто новая строка на перевод, ничего не ломается
 *   - статус переименовали -> бэкенд сам инвалидирует кэш по hash(текста)
 *   - статус удалили -> просто больше не запрашивается, мёртвого кода не остаётся
 *
 * НЕ использовать для пользовательского контента (тексты гипотез, комментарии
 * и т.п.) — только для строк, которые задаёт сама система.
 */

const BATCH_DELAY_MS = 120
// Локальная модель отвечает по очереди, а nginx на проде обрывает запрос через 60 с: один запрос
// на всю страницу не годится (30 длинных строк по схеме ключ==значение — около минуты).
const DYN_CHUNK_SIZE = 10
let pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush(locale: string, onResult: (dict: Record<string, string>) => void) {
  const strings = Array.from(pending)
  pending = new Set()
  timer = null
  if (strings.length === 0) return

  const payload: Record<string, string> = {}
  for (const s of strings) payload[s] = s

  // Пачками, последовательно. Ключ == значение (текст-как-ключ), поэтому «перевод», равный оригиналу,
  // loadTranslationsChunked отбрасывает; строки из missing повторяются, в кэш не попадают.
  loadTranslationsChunked({
    strings: payload,
    chunkSize: DYN_CHUNK_SIZE,
    concurrency: 1,
    post: chunk => api.post(`/api/v1/i18n/ensure/${locale}`, { strings: chunk }).then(resp => resp.data as EnsureReply),
    onChunk: onResult,
  }).catch(err => console.error("Не удалось перевести динамический текст:", err))
}

export function useDynamicT(opts: { noYo?: boolean } = {}) {
  const locale = useStore(s => s.locale)
  const dynamicTranslations = useStore(s => s.dynamicTranslations)
  const mergeDynamicTranslations = useStore(s => s.mergeDynamicTranslations)
  const resetDynamicTranslations = useStore(s => s.resetDynamicTranslations)
  const prevLocale = useRef(locale)

  useEffect(() => {
    if (prevLocale.current !== locale) {
      resetDynamicTranslations()
      prevLocale.current = locale
    }
  }, [locale, resetDynamicTranslations])

  const ensure = useCallback((strings: string[]) => {
    if (locale === "ru" || strings.length === 0) return
    const cacheKey = dynCacheKey(locale)
    // Свежее состояние, а не замкнувшееся при рендере: при смене языка хранилище сбрасывается
    // эффектом выше, и ensure не должен считать переведёнными строки прежнего языка.
    const current = useStore.getState().dynamicTranslations
    let missing = false
    for (const s of strings) {
      if (!s) continue
      if (!(s in current)) {
        pending.add(s)
        missing = true
      }
    }
    if (!missing) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => flush(locale, dict => {
      mergeDynamicTranslations(dict)
      if (typeof window !== "undefined") {
        try {
          const existing = JSON.parse(localStorage.getItem(cacheKey) ?? "{}")
          localStorage.setItem(cacheKey, JSON.stringify({ ...existing, ...dict }))
        } catch { /* noop */ }
      }
    }), BATCH_DELAY_MS)
  }, [locale, dynamicTranslations, mergeDynamicTranslations])

  // Ключ перевода и значения в данных остаются прежними (статусы хранятся с буквой йо). По умолчанию
  // текст не меняется; noYo включают только там, где в dt идут строки, заданные системой (статусы,
  // приоритеты, стадии): на экран они выходят без этой буквы. Пользовательский текст так не трогаем.
  const strip = !!opts.noYo
  const dt = useCallback((text: string) => {
    if (!text) return text
    const fallback = strip ? noYo(text) : text
    if (locale === "ru") return fallback
    return dynamicTranslations[text] ?? fallback
  }, [locale, dynamicTranslations, strip])

  return { dt, ensure }
}

const noYo = (t: string) => t.replace(/\u0451/g, "\u0435").replace(/\u0401/g, "\u0415")

function localeKey(strings: string[]) {
  return strings.join("\u0001")
}

/**
 * Удобный шорткат: сразу и регистрирует строки, и возвращает dt().
 * Использовать в компонентах, которые рендерят список известных заранее
 * значений (например все статусы страницы) — одним вызовом на весь список.
 */
export function useDynamicTranslate(strings: string[], opts: { noYo?: boolean } = {}) {
  const { dt, ensure } = useDynamicT(opts)
  const key = localeKey(strings)

  // locale в зависимостях: раньше при смене языка на странице (ru → en без перезагрузки, или язык
  // подгружается после монтирования) ensure() повторно не вызывался, и страница оставалась русской,
  // пока переводы не подкладывались из кэша localStorage.
  const locale = useStore(s => s.locale)

  useEffect(() => {
    ensure(strings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale])

  return dt
}
