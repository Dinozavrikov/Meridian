"use client"
import { useState, type CSSProperties } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, Lock, Redo2, Undo2 } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { theme, v2, formatEntityStamp } from "@/lib/theme"
import { DEFAULT_SCALES } from "@/lib/scales"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { useEntityScales } from "@/lib/use-scales"
import type { EntityType } from "@/lib/entity-routes"
import type { EntityTab } from "@/components/layout/entity-header"
import { entityHistoryApi, blockedReasonKey, parseUndoError, type FieldChange } from "@/lib/entity-history-api"
import { labApi } from "@/lib/api"
import { historyQueryKey, invalidateAfterUndo } from "@/lib/entity-history-cache"
import { UNDO_MUTATION_KEY, useHistoryLiveRefresh } from "@/lib/use-history-live-refresh"
import { dayHeaderLabel, groupByDay } from "@/lib/entity-history-days"
import {
  buildHistoryRows, fieldLabelKey, formatHistoryValue, hasString, isScaleField, scaleIdOf, wordValues,
  type HistoryRow, type ValueEnv,
} from "@/lib/entity-history-view"
import { DiffField } from "@/components/entities/history-diff"
import { LinkHistorySection } from "@/components/entities/link-history-section"

const LIMIT = 50

/** Вкладка «История» — только владельцу: бэкенд отдаёт историю и откат лишь автору (404 остальным). */
export function historyTabs(t: (key: string) => string, isOwner: boolean): EntityTab[] {
  return isOwner ? [{ id: "history", label: t("tabs.history") }] : []
}

const CSS = `
.eh-btn{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:7px 14px;border-radius:8px;border:1px solid ${theme.ln2};background:transparent;color:${theme.tx1};font-size:13px;cursor:pointer;transition:border-color .12s,color .12s}
.eh-btn:hover:not(:disabled){border-color:${theme.accent};color:${theme.accent}}
.eh-btn:disabled{opacity:.5;cursor:default}
.eh-link{display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:0;color:#aab0cc;font-size:13px;cursor:pointer}
.eh-link:hover{color:${theme.tx1}}
`

const muted: CSSProperties = { fontSize: 13, color: "#b4b9d2", lineHeight: 1.6 }
const card: CSSProperties = {
  background: theme.bg2, border: `1px solid ${theme.ln2}`, borderRadius: 12, padding: "14px 16px", minWidth: 0,
  display: "flex", flexDirection: "column", gap: 10,
}
// Точка на линии времени: кольцо цвета фона отделяет её от линии.
const dot: CSSProperties = { position: "absolute", left: -23, top: 17, width: 8, height: 8, borderRadius: "50%", boxShadow: `0 0 0 3px ${theme.bg0}` }
const timeStyle: CSSProperties = { fontFamily: theme.mono, fontSize: 13, color: "#9aa1c2", fontVariantNumeric: "tabular-nums" }
const chipStyle: CSSProperties = { fontSize: 12, padding: "2px 9px", borderRadius: 999, border: "1px solid currentColor" }

interface Props { entityType: EntityType; entityId: number; isOwner: boolean }

export function EntityHistoryTab({ entityType, entityId, isOwner }: Props) {
  const t = useT()
  // Не владелец: текст вместо пустоты (на ?tab=history можно прийти по ссылке), запросов нет.
  if (!isOwner) return <div style={muted}>{t("history.ownerOnly")}</div>
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
      <HistoryList entityType={entityType} entityId={entityId} />
      <LinkHistorySection entityType={entityType} entityId={entityId} />
    </div>
  )
}

function HistoryList({ entityType, entityId }: { entityType: EntityType; entityId: number }) {
  const t = useT()
  const qc = useQueryClient()
  const locale = useStore(s => s.locale)
  const { scales, isLoading: scalesLoading } = useEntityScales(entityType)
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null)
  const [showTechnical, setShowTechnical] = useState(false)

  // Правка шкалы или полей руками обновляет историю сразу, без перезагрузки страницы.
  useHistoryLiveRefresh(entityType, entityId)

  const q = useQuery({
    queryKey: historyQueryKey(entityType, entityId),
    queryFn: () => entityHistoryApi.list(entityType, entityId, LIMIT),
    staleTime: 0, // при каждом открытии вкладки — свежий список, а не кэш до 30 секунд
    refetchOnMount: "always",
  })
  const items = q.data ?? []
  // lab_id в событии смены видимости показываем названием лаборатории; список нужен, только если такие события есть.
  const needLabs = items.some(i => "lab_id" in i.changed_fields)
  const labsQ = useQuery({ queryKey: ["labs"], queryFn: labApi.mine, enabled: needLabs })
  const labName = new Map(((labsQ.data ?? []) as { id: number; name: string }[]).map(l => [l.id, l.name]))

  // Системные строки (названия встроенных шкал, статусы, приоритеты) — динамический канал перевода.
  // Названия пользовательских шкал — пользовательский текст, он НЕ переводится.
  const dt = useDynamicTranslate(collectStrings(
    DEFAULT_SCALES.filter(s => s.entity_type === entityType).map(s => s.name),
    wordValues(items),
  ), { noYo: true })

  const label = (field: string): string => {
    if (isScaleField(field)) {
      if (scalesLoading) return "…"
      const s = scales.find(x => x.id === scaleIdOf(field))
      if (!s) return t("history.field.deletedScale")
      return s.builtin ? dt(s.name) : s.name
    }
    const columnScale = DEFAULT_SCALES.find(s => s.entity_type === entityType && s.id === field)
    if (columnScale) return dt(columnScale.name)
    const key = fieldLabelKey(field)
    return key ? t(key) : field
  }

  const env: ValueEnv = {
    yes: t("history.yes"),
    no: t("history.no"),
    lab: id => labName.get(id) ?? t("history.value.labUnknown", { id }),
    stamp: raw => {
      const s = formatEntityStamp(raw, locale)
      return s ? `${s.day} · ${s.time}` : undefined
    },
    word: (field, raw) => {
      if (field === "visibility") {
        const key = `history.value.visibility.${raw}`
        return hasString(key) ? t(key) : raw
      }
      return field === "status" || field === "priority" ? dt(raw) : raw
    },
  }
  const fieldView = (field: string, ch: FieldChange | undefined) => ({
    label: label(field),
    oldText: formatHistoryValue(field, ch?.old, env),
    newText: formatHistoryValue(field, ch?.new, env),
  })
  const timeOf = (raw: string) => formatEntityStamp(raw, locale)?.time ?? ""

  // eventId — какое событие откатываем (для «вперёд» это событие-откат), rowId — к какой строке
  // относится кнопка (туда же показывается ошибка).
  const undo = useMutation({
    mutationKey: UNDO_MUTATION_KEY,
    mutationFn: (v: { eventId: number; rowId: number }) => entityHistoryApi.undo(entityType, entityId, v.eventId),
    onMutate: () => setRowError(null),
    onSuccess: () => invalidateAfterUndo(qc, entityType, entityId),
    onError: (err, v) => {
      const info = parseUndoError(err)
      setRowError({ id: v.rowId, text: t(info.key, { fields: info.fields.map(label).join(", ") }) })
      // 400/404/409: вердикт мог устареть — перечитываем историю.
      qc.invalidateQueries({ queryKey: historyQueryKey(entityType, entityId) })
    },
  })

  if (q.isLoading) return <div style={muted}>{t("history.loading")}</div>
  if (q.isError) {
    return (
      <div style={muted}>
        {t("history.loadError")}{" "}
        <button type="button" className="eh-link" onClick={() => q.refetch()}>{t("history.retry")}</button>
        <style>{CSS}</style>
      </div>
    )
  }
  if (items.length === 0) return <div style={muted}>{t("history.empty")}</div>

  const rows = buildHistoryRows(items)
  const technicalCount = rows.filter(r => r.type === "undo-event").length
  const visible = showTechnical ? rows : rows.filter(r => r.type === "edit")
  const groups = groupByDay(visible, r => r.item.created_at)
  const now = new Date()

  const renderEdit = (row: Extract<HistoryRow, { type: "edit" }>) => {
    const { item, action } = row
    const busy = undo.isPending && undo.variables?.rowId === item.id
    const tone = action?.kind === "undo" ? v2.teal : row.reverted ? v2.amber : theme.tx3
    return (
      <div key={item.id} style={{ position: "relative" }}>
        <span aria-hidden="true" style={{ ...dot, background: tone }} />
        <div data-testid="history-row" style={card}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, minHeight: 28 }}>
            <span style={timeStyle}>{timeOf(item.created_at)}</span>
            {action?.kind === "undo" && <span style={{ ...chipStyle, color: v2.teal }}>{t("history.chip.current")}</span>}
            {row.reverted && <span style={{ ...chipStyle, color: v2.amber }}>{t("history.reverted")}</span>}
            <span style={{ flex: 1 }} />
            {action && (
              <button type="button" className="eh-btn" disabled={undo.isPending}
                onClick={() => undo.mutate({ eventId: action.eventId, rowId: item.id })}>
                {action.kind === "redo" ? <Redo2 size={13} /> : <Undo2 size={13} />}
                {busy
                  ? t(action.kind === "redo" ? "history.redoing" : "history.undoing")
                  : t(action.kind === "redo" ? "history.redo" : "history.undo")}
              </button>
            )}
          </div>

          {Object.entries(item.changed_fields).map(([field, ch]) => {
            const v = fieldView(field, ch)
            return <DiffField key={field} label={v.label} oldText={v.oldText} newText={v.newText} />
          })}

          {row.blocked && (
            <div style={{ ...muted, display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} />
              {t(blockedReasonKey(row.blocked.code), { fields: row.blocked.fields.map(label).join(", ") })}
            </div>
          )}
          {rowError?.id === item.id && <div style={{ fontSize: 12, color: v2.red }}>{rowError.text}</div>}
        </div>
      </div>
    )
  }

  const renderTechnical = (row: Extract<HistoryRow, { type: "undo-event" }>) => {
    const { item } = row
    const Icon = row.label === "redo" ? Redo2 : Undo2
    return (
      <div key={item.id} style={{ position: "relative" }}>
        <span aria-hidden="true" style={{ ...dot, left: -22, top: 8, width: 6, height: 6, background: theme.tx3 }} />
        <div data-testid="history-tech-row"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 10px", fontSize: 13, color: "#aab0cc" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon size={12} />{t(row.label === "redo" ? "history.badge.redo" : "history.badge.undo")}
          </span>
          <span style={timeStyle}>{timeOf(item.created_at)}</span>
          {Object.entries(item.changed_fields).map(([field, ch]) => {
            const v = fieldView(field, ch)
            return <span key={field}>{v.label}: {v.oldText} → {v.newText}</span>
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <style>{CSS}</style>
      <div style={muted}>{t("history.intro")}</div>
      {technicalCount > 0 && (
        <button type="button" className="eh-link" style={{ alignSelf: "flex-start" }}
          onClick={() => setShowTechnical(v => !v)}>
          {showTechnical ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showTechnical ? t("history.technical.hide") : t("history.technical.show", { n: technicalCount })}
        </button>
      )}

      {groups.map(g => {
        const header = dayHeaderLabel(g.date, now, locale, t)
        return (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {header && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9aa1c2" }}>{header}</span>
                <span style={{ flex: 1, height: 1, background: theme.ln2 }} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18, marginLeft: 4, minWidth: 0, borderLeft: `1px solid ${theme.ln2}` }}>
              {g.items.map(row => row.type === "edit" ? renderEdit(row) : renderTechnical(row))}
            </div>
          </section>
        )
      })}

      <div style={{ ...muted, borderTop: `1px solid ${theme.ln2}`, paddingTop: 12 }}>
        {t("history.footnote")}
        {items.length >= LIMIT && <> {t("history.limitHint", { n: LIMIT })}</>}
      </div>
    </div>
  )
}
