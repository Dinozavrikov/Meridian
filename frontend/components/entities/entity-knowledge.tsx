"use client"
import React, { useCallback, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Focus, Link2 } from "lucide-react"
import { ActionButton } from "@/components/ui/action-button"
import { SquareIconButton } from "@/components/ui/square-icon-button"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useElementSize } from "@/lib/use-element-size"
import { useInViewOnce } from "@/lib/use-in-view-once"
import { useRelatedGroups } from "@/lib/use-related-groups"
import { summarizeRelated, type TypeSummary } from "@/lib/related-summary"
import { LocalGraphPanel, RelationsPanel } from "@/components/entities/relations-panel"
import { ink, theme, typeColor } from "@/lib/theme"
import { readableOn } from "@/lib/color"

const WIDE_MIN = 640
const SUMMARY_W = 240
const GRAPH_H = 280
const GREEN = "#2ECC71"
const RED = "#E74C3C"

interface EntityKnowledgeProps {
  entityType: string
  entityId: number
  entityTitle?: string
  accent: string
  /** кнопка «Добавить связанное» для пустого состояния */
  addAction?: React.ReactNode
  /** тип связанных записей -> id вкладки страницы, где они перечислены */
  tabForType?: Partial<Record<string, string>>
  onOpenTab?: (tabId: string) => void
}

function SummaryRow({ color, name, row, onClick }: { color: string; name: string; row: TypeSummary; onClick?: () => void }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const style: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 40, padding: "0 12px", boxSizing: "border-box",
    borderRadius: 10, border: `1px solid ${ink.line}`, color: "#d6d9ec", fontSize: 14, textAlign: "left",
    background: onClick && hover ? "#181b2c" : ink.well, cursor: onClick ? "pointer" : "default",
  }
  const body = (
    <>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {row.confirming > 0 && (
        <span role="img" aria-label={`${t("knowledge.confirming")}: ${row.confirming}`} style={{ fontFamily: theme.mono, fontSize: 12, color: readableOn(GREEN) }}>+{row.confirming}</span>
      )}
      {row.refuting > 0 && (
        <span role="img" aria-label={`${t("knowledge.refuting")}: ${row.refuting}`} style={{ fontFamily: theme.mono, fontSize: 12, color: readableOn(RED) }}>−{row.refuting}</span>
      )}
      <span style={{ fontFamily: theme.mono, fontSize: 13, fontWeight: 600, color: theme.tx1 }}>{row.count}</span>
      {onClick && <ChevronRight size={14} aria-hidden style={{ color: ink.muted, flexShrink: 0 }} />}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={style}>{body}</button>
  ) : (
    <div style={style}>{body}</div>
  )
}

/**
 * «Что уже известно»: граф связей записи, сводка по типам и управление связями. Живёт на главной
 * вкладке каждой сущности. Граф рисуется, когда блок дошёл до экрана; пустое состояние — приглашение.
 */
export function EntityKnowledge({ entityType, entityId, entityTitle, accent, addAction, tabForType, onOpenTab }: EntityKnowledgeProps) {
  const t = useT()
  const typeRu = useTypeRu()
  const { grouped, total, isLoading } = useRelatedGroups(entityType, entityId)
  const [ref, size] = useElementSize<HTMLElement>()
  const [graphRef, graphSeen] = useInViewOnce<HTMLDivElement>()
  const [manage, setManage] = useState(false)
  const fitRef = useRef<(() => void) | null>(null)
  const onFitReady = useCallback((fit: (() => void) | null) => { fitRef.current = fit }, [])
  const wide = size.width >= WIDE_MIN
  const summary = summarizeRelated(grouped)
  const accentText = readableOn(accent)

  return (
    <section
      id="entity-knowledge" ref={ref} aria-label={t("knowledge.title")} aria-busy={isLoading || undefined}
      style={{ minWidth: 0, background: ink.card, border: `1px solid ${ink.line}`, borderRadius: 12, padding: 16, scrollMarginTop: 16 }}
    >
      {isLoading ? (
        <div style={{ height: 96 }} />
      ) : total === 0 ? (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, background: `${accent}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Link2 size={18} style={{ color: accentText }} />
          </span>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.tx1 }}>{t("knowledge.emptyTitle")}</div>
            <div style={{ fontSize: 13, color: ink.muted, lineHeight: 1.5, marginTop: 2 }}>{t("knowledge.emptyText")}</div>
          </div>
          {addAction}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: accentText }}>{t("knowledge.title")}</h3>
            <span style={{ fontFamily: theme.mono, fontSize: 11, padding: "2px 7px", borderRadius: 6, background: `${accent}22`, color: accentText }}>{total}</span>
            {graphSeen && (
              <span style={{ marginLeft: "auto" }}>
                {wide
                  ? <ActionButton size="sm" icon={<Focus size={14} />} onClick={() => fitRef.current?.()}>{t("knowledge.fitGraph")}</ActionButton>
                  : <SquareIconButton label={t("knowledge.fitGraph")} icon={<Focus size={16} />} onClick={() => fitRef.current?.()} />}
              </span>
            )}
          </div>
          <div data-testid="knowledge-body" data-wide={String(wide)} style={{
            display: "grid", gap: 16, alignItems: "start",
            gridTemplateColumns: wide ? `minmax(0, 1fr) ${SUMMARY_W}px` : "minmax(0, 1fr)",
          }}>
            <div ref={graphRef} style={{ minWidth: 0 }}>
              {graphSeen ? (
                <LocalGraphPanel bare height={GRAPH_H} entityType={entityType} entityId={entityId} entityTitle={entityTitle} onFitReady={onFitReady} compact={!wide} />
              ) : (
                <div role="status" style={{
                  height: GRAPH_H, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12,
                  background: "#05050a", border: "1px solid #12121e", color: ink.muted, fontSize: 13,
                }}>
                  {t("knowledge.graphLoading")}
                </div>
              )}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {summary.map(row => {
                const tabId = tabForType?.[row.type]
                return (
                  <li key={row.type}>
                    <SummaryRow
                      color={typeColor[row.type] ?? "#555"} name={typeRu[row.type] ?? row.type} row={row}
                      onClick={tabId && onOpenTab ? () => onOpenTab(tabId) : undefined}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
          <div style={{ borderTop: `1px solid ${ink.line}`, marginTop: 14, paddingTop: 8 }}>
            <button
              type="button" aria-expanded={manage} onClick={() => setManage(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", background: "transparent", border: "none", color: ink.label, fontSize: 13, cursor: "pointer" }}
            >
              <ChevronDown size={14} aria-hidden style={{ transform: manage ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              {manage ? t("knowledge.manageHide") : t("knowledge.manage")}
            </button>
            {manage && <div style={{ marginTop: 10 }}><RelationsPanel entityType={entityType} entityId={entityId} /></div>}
          </div>
        </>
      )}
    </section>
  )
}
