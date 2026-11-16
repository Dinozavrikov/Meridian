"use client"
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useIsMobile } from "@/lib/use-is-mobile"
import { useEntityPreview } from "@/components/entities/use-entity-preview"
import { usePreviewPopover } from "@/components/entities/use-preview-popover"
import { PreviewBody, PreviewPopover, type PreviewContext } from "@/components/entities/preview-card"

export { OPEN_DELAY, CLOSE_DELAY, placeCard } from "@/components/entities/use-preview-popover"
export type { PreviewContext } from "@/components/entities/preview-card"

interface PreviewLinkProps {
  type: string; id: number; href: string; style?: CSSProperties; className?: string; context?: PreviewContext; children: ReactNode
}

/** Название записи внутри PreviewLink: пунктир и стрелка показывают, что на него можно навести или нажать. */
export function PreviewLinkTitle({ children, fontSize = 14, color = "#e8e8f0" }: { children: ReactNode; fontSize?: number; color?: string }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
      <span className="min-w-0 truncate underline decoration-dotted decoration-1 underline-offset-4 group-hover:decoration-solid group-focus-visible:decoration-solid" style={{ fontSize, color }}>{children}</span>
      <ArrowUpRight size={13} aria-hidden data-testid="preview-affordance" className="shrink-0 opacity-50 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </span>
  )
}

/** Обычная ссылка на запись + предпросмотр: карточка при наведении или фокусе, шторка на мобильном. */
export function PreviewLink({ type, id, href, style, className, context, children }: PreviewLinkProps) {
  const isMobile = useIsMobile()
  const anchorRef = useRef<HTMLAnchorElement>(null)
  const pop = usePreviewPopover({ anchorRef, isMobile })
  const { data, isLoading, isError } = useEntityPreview(type, id, pop.warm || pop.open)
  const { open, measure } = pop
  useLayoutEffect(() => { if (open) measure() }, [open, measure, data, isLoading])

  return (
    <>
      <Link ref={anchorRef} href={href} style={style} className={["group rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", className].filter(Boolean).join(" ")} onClick={pop.onAnchorClick}
        onMouseEnter={pop.enter} onMouseLeave={pop.leave} onFocus={pop.enter} onBlur={pop.leave}>
        {children}
      </Link>
      <PreviewPopover open={open} isMobile={isMobile} pos={pop.pos} cardRef={pop.cardRef} type={type} id={id} href={href} data={isError ? undefined : data} pinned={pop.pinned} maxHeight={pop.maxHeight}
        body={<PreviewBody type={type} id={id} data={isError ? undefined : data} loading={isLoading} context={context} />}
        onClose={pop.close} onEnter={pop.enter} onLeave={pop.leave} />
    </>
  )
}
