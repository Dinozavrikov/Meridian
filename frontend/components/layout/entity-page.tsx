"use client"
import React from "react"
import { useStickyTop, useHeaderHeight } from "@/lib/use-sticky-top"
import { ink, theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useElementSize } from "@/lib/use-element-size"
import { EntityTopStrip } from "@/components/layout/entity-top-strip"
import { EntityTabs, type EntityTab } from "@/components/layout/entity-tabs"

/** Ширина бокового паспорта. */
export const SIDE_WIDTH = 320
/** Ширина самой панели детали, с которой паспорт уходит вбок; уже — сворачивается над вкладками. */
export const TWO_COLUMN_MIN = 900
const SIDE_BG = "#0e1120"
/** Ширина основной колонки на широком экране (без отступов): дальше строки читать трудно. */
const MAIN_MAX = 1040
/** Уже этой ширины кнопки действий становятся сеткой равной ширины, а не рваным столбиком. */
const NARROW_ACTIONS = 560
interface EntityPageProps {
  accent: string
  icon?: React.ReactNode
  kicker?: string
  dateStr?: string
  title: React.ReactNode
  tags?: React.ReactNode
  /** ряд кнопок под заголовком; главное действие — одно, остальные контурные */
  actions?: React.ReactNode
  /** полосы под действиями: проверка противоречий, подсказки рефлексии */
  insights?: React.ReactNode
  /** паспорт: compact=true — сворачиваемая карточка над вкладками, false — боковая панель */
  passport: (compact: boolean) => React.ReactNode
  tabs: EntityTab[]
  activeTab: string
  onTabChange: (id: string) => void
  /** при смене значения содержимое возвращается к началу (другая запись — другая страница) */
  scrollKey?: string | number
  /** содержимое активной вкладки */
  children: React.ReactNode
}

/**
 * Страница сущности: слева заголовок, действия, вкладки и содержимое, справа — паспорт.
 * Раскладку выбирает ширина самой панели (она меняется при перетаскивании разделителя), не окна.
 * На широкой панели обе колонки прокручиваются независимо, паспорт всегда на виду.
 */
export function EntityPage({
  accent, icon, kicker, dateStr, title, tags, actions, insights, passport, tabs, activeTab, onTabChange, scrollKey, children,
}: EntityPageProps) {
  const t = useT()
  const [ref, size] = useElementSize<HTMLDivElement>()
  // До первого измерения считаем панель широкой: на десктопе так нет мигания раскладки.
  const compact = size.width > 0 && size.width < TWO_COLUMN_MIN
  const narrow = size.width > 0 && size.width < NARROW_ACTIONS
  const asideRef = React.useRef<HTMLElement>(null)
  const asideTop = useStickyTop(asideRef, !compact)
  const headerH = useHeaderHeight()
  // Страницу прокручивает окно: новая запись должна открываться сверху, а не на позиции прошлой.
  React.useEffect(() => { if (scrollKey !== undefined && !compact) window.scrollTo({ top: 0 }) }, [scrollKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const padX = compact ? 16 : 28

  const main = (
    <div style={{
      minWidth: 0, width: "100%", boxSizing: "border-box", padding: `22px ${padX}px 48px`,
      ...(compact ? {} : { maxWidth: MAIN_MAX + padX * 2, margin: "0 auto" }),
    }}>
      <h2 style={{
        fontSize: compact ? 22 : 28, fontWeight: 700, color: theme.tx1,
        lineHeight: 1.25, margin: 0, letterSpacing: "-0.02em", overflowWrap: "anywhere",
      }}>
        {title}
      </h2>
      {tags && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>{tags}</div>}
      {actions && (
        <div style={narrow
          ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 18 }
          : { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {actions}
        </div>
      )}
      {compact && <div style={{ marginTop: 16 }}>{passport(true)}</div>}
      {insights && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>{insights}</div>}
      <div style={{ marginTop: 22, borderBottom: "1px solid #1E2236" }}>
        <EntityTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} accent={accent} />
      </div>
      <div style={{ paddingTop: 24 }}>{children}</div>
    </div>
  )

  return (
    <div ref={ref} style={{
      display: "flex", flexDirection: "column", minWidth: 0, background: theme.bg1,
      ...(compact ? { overflow: "hidden", height: "100%" } : { minHeight: `calc(100vh - ${headerH}px)` }),
    }}>
      <EntityTopStrip accent={accent} icon={icon} kicker={kicker} dateStr={dateStr} />
      {compact ? (
        <div key={scrollKey} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>{main}</div>
      ) : (
        <div style={{ display: "flex", flex: 1 }}>
          <div key={scrollKey} style={{ flex: 1, minWidth: 0 }}>{main}</div>
          <div style={{
            width: SIDE_WIDTH, flexShrink: 0, boxSizing: "border-box",
            borderLeft: `1px solid ${ink.line}`, background: SIDE_BG, ["--passport-bg" as string]: SIDE_BG,
          } as React.CSSProperties}>
            <aside ref={asideRef} aria-label={t("passport.title")} style={{ position: "sticky", top: asideTop, padding: 20 }}>
              {passport(false)}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
