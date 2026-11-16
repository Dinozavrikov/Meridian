"use client"
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { useIsMobile } from "@/lib/use-is-mobile"
import { ENTITY_ROUTES, parseEntityHref, safeEntityHref } from "@/lib/entity-routes"
import { typeColor } from "@/lib/theme"
import { useEntityPreview } from "@/components/entities/use-entity-preview"
import { usePreviewPopover } from "@/components/entities/use-preview-popover"
import { PreviewBody, PreviewPopover } from "@/components/entities/preview-card"

interface RichHtmlProps {
  /** Уже очищенный HTML (sanitize/renderableHtml делает вызывающий). */
  html: string
  accent: string
  className?: string
  style?: CSSProperties
  /** Цвет цитат. */
  muted?: string
}

function hitOf(e: { target: EventTarget | null }, root: HTMLElement | null) {
  const el = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null
  if (!el || !root || !root.contains(el)) return null
  const ref = parseEntityHref(el.getAttribute("href") ?? "")
  return ref ? { el, ref } : null
}

/**
 * Текст записи с внутренними ссылками meridian://тип/id: наведение показывает карточку,
 * клик закрепляет её (страница не сменяется), Cmd/Ctrl/Shift-клик открывает запись в новой вкладке.
 */
export function RichHtml({ html, accent, className, style, muted = "#808090" }: RichHtmlProps) {
  const isMobile = useIsMobile()
  const uid = "rh" + useId().replace(/[^a-zA-Z0-9]/g, "")
  const rootRef = useRef<HTMLDivElement>(null)
  const lastEl = useRef<HTMLElement | null>(null)
  const lastHref = useRef<string | null>(null)
  // Якорь переживает перерисовку HTML (например, пришёл перевод): если узел заменили, ищем ту же ссылку заново.
  const anchorRef = useMemo(() => ({
    get current(): HTMLElement | null {
      const el = lastEl.current
      if (el?.isConnected) return el
      const root = rootRef.current
      if (!root || !lastHref.current) return null
      const found = Array.from(root.querySelectorAll("a")).find(a => a.getAttribute("href") === lastHref.current) as HTMLElement | undefined
      if (found) lastEl.current = found
      return found ?? null
    },
  }), [])
  const [target, setTarget] = useState<{ type: string; id: number } | null>(null)
  const pop = usePreviewPopover({ anchorRef, isMobile })
  const { data, isLoading, isError } = useEntityPreview(target?.type ?? "", target?.id ?? 0, !!target && (pop.warm || pop.open))
  const { open, measure } = pop
  useLayoutEffect(() => { if (open) measure() }, [open, measure, data, isLoading, target])

  // Стабильный объект: новый на каждый рендер заставил бы React пересобрать innerHTML и заменить все <a>.
  const inner = useMemo(() => ({ __html: html }), [html])

  const css = useMemo(() => {
    const typed = Object.keys(ENTITY_ROUTES).map(t => {
      const c = typeColor[t] ?? accent
      return `.${uid} a[href^="meridian://${t}/"]{color:${c};text-decoration:underline dotted;text-underline-offset:3px}`
    }).join("")
    return `.${uid} img{max-width:100%;border-radius:8px;margin:8px 0}`
      + `.${uid} a{color:${accent};cursor:pointer}${typed}`
      + `.${uid} blockquote{border-left:3px solid ${accent};padding-left:12px;color:${muted};margin:6px 0}`
  }, [uid, accent, muted])

  const aim = (hit: NonNullable<ReturnType<typeof hitOf>>) => {
    lastEl.current = hit.el
    lastHref.current = hit.el.getAttribute("href")
    setTarget({ type: hit.ref.type, id: hit.ref.id })
  }
  const onOver = (e: MouseEvent | React.FocusEvent) => {
    const hit = hitOf(e, rootRef.current)
    if (!hit || pop.pinned) return
    aim(hit); pop.enter()
  }
  const onOut = (e: MouseEvent | React.FocusEvent) => { if (hitOf(e, rootRef.current)) pop.leave() }
  const onClick = (e: MouseEvent) => {
    const hit = hitOf(e, rootRef.current)
    if (!hit) return
    e.preventDefault() // meridian:// — не настоящий адрес, браузеру его отдавать нельзя
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      window.open(safeEntityHref(hit.ref.type, hit.ref.id), "_blank", "noopener")
      return
    }
    aim(hit); pop.pin()
  }

  return (
    <>
      <div ref={rootRef} className={[className, uid].filter(Boolean).join(" ")} style={style}
        onMouseOver={onOver} onMouseOut={onOut} onFocus={onOver} onBlur={onOut} onClick={onClick}
        dangerouslySetInnerHTML={inner} />
      <style>{css}</style>
      <PreviewPopover open={open} isMobile={isMobile} pos={pop.pos} cardRef={pop.cardRef}
        type={target?.type ?? ""} id={target?.id ?? 0} href={target ? safeEntityHref(target.type, target.id) : "/"} data={isError ? undefined : data} pinned={pop.pinned} maxHeight={pop.maxHeight}
        body={<PreviewBody type={target?.type ?? ""} id={target?.id ?? 0} data={isError ? undefined : data} loading={isLoading} />}
        onClose={pop.close} onEnter={pop.enter} onLeave={pop.leave} />
    </>
  )
}
