"use client"
import React, { useState } from "react"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"
import { useEntityStage } from "@/lib/use-entity-stage"
import { STAGE_VALUES, stageLabel, type StageValue } from "@/lib/stage-labels"
import { ActionButton } from "@/components/ui/action-button"
import { ink, theme, v2 } from "@/lib/theme"

interface StageTrackProps {
  entityType: string
  entityId: number
  isOwner: boolean
  accent?: string
}

const OFF = "#4a5178"  // контур не достигнутых стадий (декоративный)
const NODE = 12

// Путь «вопрос → … → передача на рынок»: 8 стадий вертикально, с названиями. Владелец нажимает на
// стадию — внизу появляется подтверждение (стадия — веха исследования, случайный тап не должен её
// менять). Не отслеживается — узлы пунктирные, подтверждение «начать путь». Чужой записи без стадии
// трек не показывает вообще.
export function StageTrack({ entityType, entityId, isOwner, accent = "#4A90D9" }: StageTrackProps) {
  const t = useT()
  const isMobile = useIsMobile()
  const { stage, isLoading, isPending, isError, setStage } = useEntityStage(entityType, entityId)
  const [pending, setPending] = useState<StageValue | null>(null)

  if (isLoading) return null
  if (!stage && !isOwner) return null

  const tracked = !!stage
  const currentIdx = stage ? STAGE_VALUES.indexOf(stage as StageValue) : -1
  const rowH = isMobile ? 40 : 32
  const pendingIdx = pending ? STAGE_VALUES.indexOf(pending) : -1
  const confirmKey = !tracked ? "stagePanel.confirmStart" : pendingIdx > currentIdx ? "stagePanel.confirmForward" : "stagePanel.confirmBack"

  return (
    <div data-testid="stage-track" onKeyDown={e => { if (e.key === "Escape") setPending(null) }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>
          {t("stagePanel.modalTitle")}
        </span>
        {tracked ? (
          <span style={{ fontFamily: theme.mono, fontSize: 12, color: ink.muted }}>{currentIdx + 1}/{STAGE_VALUES.length}</span>
        ) : (
          <span style={{ fontSize: 12, fontStyle: "italic", color: ink.muted }}>{t("stagePanel.notTracked")}</span>
        )}
      </div>

      <div role="group" aria-label={t("stagePanel.modalTitle")} style={{
        position: "relative", marginLeft: NODE / 2, borderLeft: `2px solid ${ink.line}`,
      }}>
        {tracked && currentIdx > 0 && (
          <span aria-hidden style={{ position: "absolute", left: -2, top: rowH / 2, width: 2, height: currentIdx * rowH, background: accent }} />
        )}
        {STAGE_VALUES.map((s, i) => {
          const done = tracked && i <= currentIdx
          const current = i === currentIdx
          const chosen = pending === s
          const label = stageLabel(t, s)
          const rowStyle: React.CSSProperties = {
            position: "relative", display: "flex", alignItems: "center", width: "100%", height: rowH,
            padding: "0 0 0 18px", background: "transparent", border: "none", textAlign: "left",
            fontSize: 13, fontWeight: current || chosen ? 600 : 400,
            color: chosen ? theme.tx1 : current ? accent : done ? "#c9ccdd" : ink.muted,
            cursor: isOwner && !current ? "pointer" : "default",
          }
          const dot = (
            <span aria-hidden style={{
              position: "absolute", left: -NODE / 2 - 1, top: (rowH - NODE) / 2, width: NODE, height: NODE,
              borderRadius: "50%", boxSizing: "border-box",
              background: done ? accent : "var(--passport-bg, #0e1120)",
              border: `2px solid ${done || chosen ? accent : OFF}`,
              outline: current ? `2px solid ${accent}` : "none", outlineOffset: 2,
            }} />
          )
          return isOwner ? (
            <button
              key={s} type="button" aria-current={current ? "step" : undefined} disabled={isPending}
              onClick={() => { if (!current) setPending(s) }}
              style={rowStyle}
            >
              {dot}{label}
            </button>
          ) : (
            <div key={s} aria-current={current ? "step" : undefined} style={rowStyle}>{dot}{label}</div>
          )
        })}
      </div>

      {pending && (
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${accent}55`, background: `${accent}14` }}>
          <div style={{ fontSize: 13, color: theme.tx1, marginBottom: 10, lineHeight: 1.4 }}>
            {t(confirmKey, { stage: stageLabel(t, pending) })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton variant="primary" accent={accent} size="sm" disabled={isPending}
              onClick={() => setStage(pending, { onSuccess: () => setPending(null) })}>
              {t("stagePanel.confirm")}
            </ActionButton>
            <ActionButton size="sm" disabled={isPending} onClick={() => setPending(null)}>{t("stagePanel.cancel")}</ActionButton>
          </div>
        </div>
      )}
      {isError && <div role="alert" style={{ fontSize: 12, color: v2.red }}>{t("stagePanel.saveFailed")}</div>}
    </div>
  )
}
