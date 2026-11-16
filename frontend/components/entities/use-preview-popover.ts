"use client"
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"

export const OPEN_DELAY = 300
export const CLOSE_DELAY = 150
export const CARD_W = 340
export const MARGIN = 8
const GAP = 8

/** Якорь — любой DOM-элемент (ссылка React или <a> внутри HTML-текста). */
type AnchorRef = { readonly current: HTMLElement | null }

/** Положение карточки: под ссылкой, а если снизу тесно — над ней; по горизонтали не выходит за окно. */
export function placeCard(anchor: { left: number; top: number; bottom: number }, card: { w: number; h: number }, vw: number, vh: number) {
  let left = Math.min(Math.max(anchor.left, MARGIN), Math.max(MARGIN, vw - card.w - MARGIN))
  const below = anchor.bottom + GAP
  const top = below + card.h <= vh - MARGIN || anchor.top - GAP - card.h < MARGIN ? below : anchor.top - GAP - card.h
  if (left < MARGIN) left = MARGIN
  return { left, top }
}

const MIN_H = 120

/**
 * Положение и предельная высота карточки. Если она целиком помещается под ссылкой или над ней — как placeCard.
 * Если нет — берём сторону, где места больше, и ограничиваем высоту (внутри карточки включается прокрутка).
 */
export function fitCard(anchor: { left: number; top: number; bottom: number }, card: { w: number; h: number }, vw: number, vh: number) {
  const { left } = placeCard(anchor, card, vw, vh)
  const below = anchor.bottom + GAP
  const spaceBelow = vh - MARGIN - below
  const spaceAbove = anchor.top - GAP - MARGIN
  if (card.h <= spaceBelow) return { left, top: below, maxHeight: spaceBelow }
  if (card.h <= spaceAbove) return { left, top: anchor.top - GAP - card.h, maxHeight: card.h }
  if (Math.max(spaceBelow, spaceAbove) < MIN_H) return { left, top: MARGIN, maxHeight: vh - MARGIN * 2 }
  return spaceBelow >= spaceAbove
    ? { left, top: below, maxHeight: spaceBelow }
    : { left, top: anchor.top - GAP - spaceAbove, maxHeight: spaceAbove }
}

/**
 * Поведение предпросмотра: задержки, закрепление, Esc, положение, мобильный режим.
 * Не знает ни про данные, ни про разметку.
 * Esc ловится на window в capture-фазе и гасится: карточка внутри модалки закрывается одна, модалка остаётся.
 */
export function usePreviewPopover({ anchorRef, isMobile }: { anchorRef: AnchorRef; isMobile: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressEnter = useRef(false)
  const [open, setOpen] = useState(false)
  const [warm, setWarm] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

  const clear = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])
  const enter = useCallback(() => {
    if (isMobile) return
    if (suppressEnter.current) { suppressEnter.current = false; return } // фокус вернули после Esc — не открывать заново
    clear(); setWarm(true)
    if (!open) openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY)
  }, [isMobile, open, clear])
  const leave = useCallback(() => {
    if (isMobile || pinned) return
    clear()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
  }, [isMobile, pinned, clear])
  const close = useCallback(() => { clear(); setOpen(false); setPinned(false) }, [clear])
  /** Открыть сразу и удерживать, пока не нажмут Esc или не кликнут мимо. */
  const pin = useCallback(() => { clear(); setWarm(true); setOpen(true); setPinned(true) }, [clear])

  useEffect(() => clear, [clear])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      const back = pinned ? anchorRef.current : null
      close()
      if (back) {
        suppressEnter.current = true
        back.focus()
        setTimeout(() => { suppressEnter.current = false }, 0)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, pinned, close, anchorRef])

  useEffect(() => {
    if (!pinned || isMobile) return
    const onDown = (e: Event) => {
      const n = e.target as Node
      if (cardRef.current?.contains(n) || anchorRef.current?.contains(n)) return
      close()
    }
    document.addEventListener("mousedown", onDown, true)
    return () => document.removeEventListener("mousedown", onDown, true)
  }, [pinned, isMobile, close, anchorRef])

  useEffect(() => {
    if (pinned && open && !isMobile && pos) cardRef.current?.focus({ preventScroll: true })
  }, [pinned, open, isMobile, pos])

  /** Пересчитать положение карточки; вызывающий зовёт, когда меняется её содержимое. */
  const measure = useCallback(() => {
    const el = anchorRef.current
    if (isMobile || !el) return
    const a = el.getBoundingClientRect()
    const card = cardRef.current
    // Естественная высота: у ограниченной карточки rect.height обрезан, полную даёт scrollHeight (+ рамки).
    const h = (card ? Math.max(card.getBoundingClientRect().height, card.scrollHeight + 4) : 0) || 200
    const f = fitCard(a, { w: CARD_W, h }, window.innerWidth, window.innerHeight)
    setPos({ left: f.left, top: f.top })
    setMaxHeight(f.maxHeight)
  }, [anchorRef, isMobile])

  const onAnchorClick = useCallback((e: MouseEvent) => {
    if (isMobile) { e.preventDefault(); setOpen(true) } else close()
  }, [isMobile, close])

  return { open, warm, pinned, pos, maxHeight, cardRef, enter, leave, close, pin, measure, onAnchorClick }
}
