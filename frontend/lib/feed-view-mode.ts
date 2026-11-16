import { useCallback, useEffect, useState } from "react"
import type { StorageLike } from "@/lib/feed-groups"

// Вид ленты: карточки-досье или список. Выбор хранится в localStorage и один на все ленты (общая и лабораторные).
export type FeedViewMode = "cards" | "list"
export const FEED_VIEW_KEY = "meridian.feed.view"

function defaultStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage } catch { return null }
}

export function parseViewMode(raw: unknown): FeedViewMode {
  return raw === "list" ? "list" : "cards"
}

export function readViewMode(storage: StorageLike | null = defaultStorage()): FeedViewMode {
  try { return parseViewMode(storage?.getItem(FEED_VIEW_KEY)) } catch { return "cards" }
}

export function writeViewMode(mode: FeedViewMode, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(FEED_VIEW_KEY, mode) } catch { /* приватный режим или квота: выбор просто не запомнится */ }
}

/** Первый рендер всегда «карточки» (сервер хранилища не видит — иначе гидратация разойдётся), сохранённый
 *  выбор подставляется после монтирования. */
export function useFeedViewMode(): [FeedViewMode, (mode: FeedViewMode) => void] {
  const [mode, setMode] = useState<FeedViewMode>("cards")
  useEffect(() => { setMode(readViewMode()) }, [])
  const choose = useCallback((next: FeedViewMode) => { setMode(next); writeViewMode(next) }, [])
  return [mode, choose]
}
