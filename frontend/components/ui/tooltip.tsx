"use client"
import { useState, useRef, useLayoutEffect } from "react"
import { createPortal } from "react-dom"

/** Богатая карточка вместо плоской подсказки: заголовок, метка-контекст и цвет акцента. */
export interface TooltipCard { title: string; eyebrow?: string; accent?: string }

interface Anchor { x: number; top: number; bottom: number }
interface Pos { left: number; above: boolean; arrow: number }

const CARD_TOP = "#181b2d"
const CARD_BOTTOM = "#12141f"
const CARD_EDGE = "#2a2a40"

export function Tooltip({ text, card, children, fullWidth }: {
  text?: string; card?: TooltipCard; children: React.ReactNode; fullWidth?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const gap = card ? 12 : 8

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) { setPos(null); return }
    const margin = 8
    const r = bubbleRef.current.getBoundingClientRect()
    let x = anchor.x - r.width / 2
    if (x < margin) x = margin
    if (x + r.width > window.innerWidth - margin) x = window.innerWidth - margin - r.width
    // Карточка открывается вниз, когда над элементом не хватает места. Плоская подсказка всегда сверху.
    const above = card ? anchor.top - r.height - gap >= margin : true
    const arrow = Math.min(Math.max(anchor.x - x, 20), Math.max(r.width - 20, 20))
    setPos({ left: x, above, arrow })
  }, [anchor, card, gap])

  if (!text) return fullWidth ? <div style={{ width: "100%" }}>{children}</div> : <>{children}</>

  // Открывается и по наведению, и по фокусу (события фокуса всплывают от вложенного элемента), закрывается по Escape.
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setAnchor({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom })
  }

  const accent = card?.accent ?? "#8b92b5"
  const edge = card ? `color-mix(in srgb, ${accent} 40%, ${CARD_EDGE})` : CARD_EDGE

  const place: React.CSSProperties = !anchor ? {} : pos
    ? { left: pos.left, top: pos.above ? anchor.top - gap : anchor.bottom + gap, transform: pos.above ? "translateY(-100%)" : "none", visibility: "visible" }
    : { left: anchor.x, top: anchor.top - gap, transform: "translate(-50%, -100%)", visibility: "hidden" }

  const bubble = !anchor ? null : card ? (
    <div ref={bubbleRef} role="tooltip" className="feat-tipcard" data-placement={pos?.above === false ? "below" : "above"} style={{
      position: "fixed", ...place, zIndex: 99999, width: "max-content", maxWidth: 300, boxSizing: "border-box",
      padding: "15px 16px 16px", pointerEvents: "none",
      background: `linear-gradient(180deg, ${CARD_TOP} 0%, ${CARD_BOTTOM} 100%)`,
      border: `1px solid ${edge}`, borderRadius: 12,
      boxShadow: `0 18px 48px rgba(0,0,0,0.55), 0 0 40px -16px ${accent}`,
    }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, borderRadius: "12px 12px 0 0", background: `linear-gradient(90deg, ${accent}, transparent 80%)` }} />
      {card.eyebrow && (
        <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{card.eyebrow}</div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.005em", color: "#f2efe9" }}>{card.title}</div>
      <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.55, color: "#b4b8d0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
      {pos && (
        <span aria-hidden="true" style={{
          position: "absolute", left: pos.arrow, width: 10, height: 10, transform: "translateX(-50%) rotate(45deg)",
          ...(pos.above
            ? { bottom: -6, background: CARD_BOTTOM, borderRight: `1px solid ${edge}`, borderBottom: `1px solid ${edge}` }
            : { top: -6, background: CARD_TOP, borderLeft: `1px solid ${edge}`, borderTop: `1px solid ${edge}` }),
        }} />
      )}
    </div>
  ) : (
    <div ref={bubbleRef} role="tooltip" style={{
      position: "fixed", ...place,
      background: "#1a1a2e", border: "1px solid #2a2a40",
      color: "#c0c0d8", fontSize: 11, lineHeight: 1.4,
      padding: "5px 9px", borderRadius: 6,
      maxWidth: 320, width: "max-content",
      pointerEvents: "none", zIndex: 99999,
      boxShadow: "0 4px 16px #00000066",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
    }}>{text}</div>
  )

  return (
    <div ref={wrapRef} style={fullWidth
      ? { display: "flex", width: "100%", minWidth: 0, overflow: card ? "visible" : "hidden" }
      : { display: "inline-flex", minWidth: 0, flexShrink: 1, overflow: card ? "visible" : "hidden", maxWidth: "100%" }}
      onMouseEnter={e => show(e.currentTarget as HTMLElement)}
      onMouseLeave={() => setAnchor(null)}
      onFocus={e => show(e.currentTarget as HTMLElement)}
      onBlur={() => setAnchor(null)}
      onKeyDown={e => { if (e.key === "Escape") setAnchor(null) }}
    >
      {children}
      {bubble && typeof document !== "undefined" && createPortal(bubble, document.body)}
    </div>
  )
}
