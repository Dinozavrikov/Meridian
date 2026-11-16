"use client"
import { useRef, type CSSProperties, type ReactNode, type Ref } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { X, Link2, Tags, ExternalLink, Lock, Users, Globe2, MessageSquare } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { StatusBadge } from "@/components/ui/status-badge"
import { LinkLockNotice, type LinkLock } from "@/components/entities/link-lock-notice"
import { type Preview } from "@/components/entities/use-entity-preview"
import { CARD_W, MARGIN } from "@/components/entities/use-preview-popover"
import { ink, theme, typeColor } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import { useStore } from "@/lib/store"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { EffectsBlock } from "@/components/entities/effects-block"

export interface PreviewContext { label?: string; color?: string; via?: string; lock?: LinkLock | null; provenance?: ReactNode }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "")

/** Содержимое карточки: только отображение, без запросов и таймеров. */
const VIS_ICON: Record<string, typeof Lock> = { private: Lock, lab: Users, public: Globe2 }

export function PreviewBody({ type, id, data, loading, context }: { type: string; id: number; data?: Preview; loading: boolean; context?: PreviewContext }) {
  const t = useT()
  const typeRu = useTypeRu()
  const user = useStore(s => s.user)
  // Гостю перевод недоступен (эндпоинт требует вход), свой текст не переводим. Поля отдельные от "title"/"preview":
  // кэш ключуется по (тип, id, поле) и хранит хэш текста, общий ключ с другим текстом перезаписывался бы.
  const skipTr = !user || !data || data.is_owner
  const title = useTranslatedField(type, id, "preview_title", data?.title ?? "", skipTr)
  const excerpt = useTranslatedField(type, id, "preview_excerpt", data?.excerpt ?? "", skipTr)
  const color = typeColor[type] ?? "#4A90D9"
  if (loading) {
    return (
      <div role="status" aria-label={t("preview.loading")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[60, 100, 90, 40].map((w, i) => <div key={i} style={{ height: i === 0 ? 14 : 12, width: `${w}%`, borderRadius: 6, background: ink.line, opacity: 0.6 }} />)}
      </div>
    )
  }
  if (!data) return <div style={{ fontSize: 13, color: ink.muted }}>{t("preview.unavailable")}</div>
  const metricValue = (m: { key: string; value: number | string }) => (m.key === "expected_check_date" ? fmtDate(String(m.value)) : String(m.value))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: readableOn(color) }}>{typeRu[type] ?? type}</span>
        <span style={{ flex: 1 }} />
        {data.visibility && VIS_ICON[data.visibility] && (() => { const Icon = VIS_ICON[data.visibility!]; return (
          <span title={t(`visibility.${data.visibility}`)} aria-label={t(`visibility.${data.visibility}`)} style={{ display: "inline-flex", color: ink.muted }}><Icon size={13} aria-hidden /></span>
        ) })()}
        {data.status && <StatusBadge status={data.status} fontSize={12} />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: theme.tx1, overflowWrap: "anywhere" }}>{title || t("preview.untitled")}</div>
      {excerpt && <div style={{ fontSize: 13, lineHeight: 1.6, color: "#c3c8e0", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{excerpt}</div>}
      {data.metrics.length > 0 && (
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
          {data.metrics.map(m => (
            <div key={m.key} style={{ padding: "6px 10px", borderRadius: 8, background: ink.well, border: `1px solid ${ink.line}` }}>
              <dt style={{ fontSize: 11, color: ink.muted }}>{t(`preview.metric.${m.key}`)}</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: theme.mono, color: theme.tx1 }}>{metricValue(m)}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.tags.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Tags size={12} aria-hidden style={{ color: ink.muted }} />
          {data.tags.slice(0, 6).map(tag => <span key={tag} style={{ fontSize: 12, padding: "1px 8px", borderRadius: 999, border: `1px solid ${ink.line}`, color: ink.label }}>{tag}</span>)}
        </div>
      )}
      <EffectsBlock type={type} effect={data.effect} effects={data.effects} />
      {context && (context.label || context.via || context.lock || context.provenance) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: `1px solid ${ink.line}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{t("preview.relation")}</div>
          {context.label && (
            <span data-testid="relation-chip" data-link-color={context.color ?? ""}
              style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                border: `1px solid ${context.color ? `${context.color}59` : ink.line}`,
                background: context.color ? `${context.color}1f` : "transparent",
                color: context.color ? readableOn(context.color) : ink.label }}>
              {context.label}
            </span>
          )}
          {context.via && <div style={{ fontSize: 12, color: ink.muted }}>{context.via}</div>}
          {context.provenance}
          {context.lock && <LinkLockNotice lock={context.lock} />}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, fontSize: 12, color: ink.muted, paddingTop: 10, borderTop: `1px solid ${ink.line}` }}>
        {data.author.username
          ? <Link href={`/profile/${data.author.username}`} aria-label={`${t("preview.author")}: ${data.author.display_name || data.author.username}`} style={{ color: ink.label, textDecoration: "none" }}>{data.author.display_name || data.author.username}</Link>
          : <span>{data.author.display_name}</span>}
        {data.created_at && <span>· {fmtDate(data.created_at)}</span>}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}><Link2 size={12} aria-hidden />{t("preview.links", { n: String(data.links_count) })}</span>
      </div>
    </div>
  )
}

/** «Открыть» и «Обсуждение» (последнее только у публичных записей: у закрытых страница обсуждения недоступна). */
export function PreviewActions({ type, id, href, data }: { type: string; id: number; href: string; data?: Preview }) {
  const t = useT()
  const color = typeColor[type] ?? "#4A90D9"
  if (!data) return null // загрузка или 404: вести некуда
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <Link href={href} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 13.5, textDecoration: "none", color: "#0b0d14", background: color }}>
        {t("preview.open")}<ExternalLink size={14} aria-hidden />
      </Link>
      {data?.visibility === "public" && (
        <Link href={`/feed/discussion/${type}/${id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13.5, textDecoration: "none", color: theme.tx1, border: `1px solid ${ink.line}` }}>
          <MessageSquare size={14} aria-hidden />{t("preview.discussion")}
        </Link>
      )}
    </div>
  )
}

interface PreviewPopoverProps {
  open: boolean; isMobile: boolean; pos: { left: number; top: number } | null; cardRef: Ref<HTMLDivElement>
  type: string; id: number; href: string; body: ReactNode; data?: Preview; pinned?: boolean; maxHeight?: number
  onClose: () => void; onEnter: () => void; onLeave: () => void
}

/** Оболочка: карточка у якоря на десктопе, шторка снизу на мобильном. */
export function PreviewPopover({ open, isMobile, pos, cardRef, type, id, href, body, data, pinned, maxHeight, onClose, onEnter, onLeave }: PreviewPopoverProps) {
  const t = useT()
  const touchY = useRef<number | null>(null)
  if (!open || typeof document === "undefined") return null
  const surface: CSSProperties = { background: theme.bg1, border: `1px solid ${ink.line}`, boxShadow: "0 12px 40px rgba(0,0,0,0.55)", color: theme.tx1 }
  return createPortal(
    isMobile ? (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={t("preview.title")} onClick={e => e.stopPropagation()}
          style={{ ...surface, position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "85vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "8px 16px 20px", boxSizing: "border-box" }}>
          <div onTouchStart={e => { touchY.current = e.touches[0].clientY }}
            onTouchEnd={e => { if (touchY.current != null && e.changedTouches[0].clientY - touchY.current > 60) onClose(); touchY.current = null }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", height: 24, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: ink.line }} />
            <button type="button" aria-label={t("preview.close")} onClick={onClose}
              style={{ position: "absolute", right: 0, top: 0, background: "none", border: "none", color: ink.muted, padding: 4 }}><X size={18} /></button>
          </div>
          {body}
          <PreviewActions type={type} id={id} href={href} data={data} />
        </div>
      </div>
    ) : (
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-label={t("preview.title")} onMouseEnter={onEnter} onMouseLeave={onLeave}
        style={{ ...surface, position: "fixed", zIndex: 99998, width: CARD_W, maxWidth: `calc(100vw - ${MARGIN * 2}px)`, boxSizing: "border-box", padding: 16, borderRadius: 14,
          borderTop: `3px solid ${typeColor[type] ?? "#4A90D9"}`, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", outline: "none", maxHeight, overflowY: "auto", overscrollBehavior: "contain" }}>
        {body}
        {pinned && data && <div style={{ position: "sticky", bottom: 0, background: theme.bg1, display: "flow-root" }}><PreviewActions type={type} id={id} href={href} data={data} /></div>}
      </div>
    ),
    document.body,
  )
}
