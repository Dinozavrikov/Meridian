"use client"
import { useState } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { useT } from "@/lib/i18n/useT"
import { levelFor, useScaleTrack } from "@/lib/use-scale-track"
import type { ScaleLevel } from "@/lib/scales"

export interface RulerProps {
  name: string
  value: number | null | undefined
  min: number
  max: number
  color: string
  step?: number
  levels?: ScaleLevel[]
  size?: "sm" | "lg"
  showLabel?: boolean
  onChange?: (v: number) => void
  hideLabel?: boolean
  variant?: "compact" | "detail"
}

export function Ruler({
  name, value, min, max, color, step = 1, levels,
  size = "sm", showLabel = false, onChange, variant = "compact", hideLabel = false,
}: RulerProps) {
  const t = useT()
  const { trackRef, liveDrag, effectiveValue, isSet, interactive, commit, trackProps, touchAction } =
    useScaleTrack({ value, min, max, step, onChange })

  const display = liveDrag ?? (isSet ? (effectiveValue as number) : null)
  const currentLevel = display != null ? levelFor(levels, display) : undefined

  const labelText = isSet
    ? (currentLevel?.label ?? `${effectiveValue}${max > 20 ? "" : "/" + max}`)
    : t("ruler.notSet")

  const tooltipText = isSet
    ? (currentLevel ? t("ruler.tooltipWithLevel", { name, value: effectiveValue as number, max, level: currentLevel.label }) : t("ruler.tooltipWithoutLevel", { name, value: effectiveValue as number, max }))
    : t("ruler.notSetTooltip", { name })

  const pct = (() => {
    const v = liveDrag ?? (isSet ? (effectiveValue as number) : min)
    return ((v - min) / Math.max(1e-9, max - min)) * 100
  })()

  const tickValues: number[] =
    levels && levels.length > 0 && levels.length <= 8
      ? levels.map(l => l.value)
      : [min, max]

  const barH = showLabel ? (size === "lg" ? 12 : 10) : (size === "lg" ? 10 : 8)
  const dotSize = size === "lg" ? 12 : 9

  const track = (
    <div
      ref={trackRef}
      role="slider"
      aria-label={name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={isSet ? (effectiveValue as number) : undefined}
      aria-valuetext={labelText}
      {...trackProps}
      style={{
        position: "relative", width: "100%",
        padding: interactive ? "6px 0" : 0,
        margin: interactive ? "-6px 0" : 0,
        cursor: interactive ? "pointer" : "default",
        touchAction,
      }}
    >
    <div style={{ position: "relative", width: "100%", height: barH }}>
      <div style={{
        position: "absolute", left: 0, right: 0, top: "50%", height: 2,
        transform: "translateY(-50%)", borderRadius: 2, background: "rgba(255,255,255,0.12)",
      }} />
      <div style={{
        position: "absolute", left: 0, top: "50%", height: 2, width: `${pct}%`,
        transform: "translateY(-50%)", borderRadius: 2,
        background: isSet || liveDrag != null ? color : "rgba(255,255,255,0.12)",
        transition: liveDrag != null ? "none" : "width 0.15s",
      }} />
      {tickValues.map(tv => {
        const tp = ((tv - min) / Math.max(1e-9, max - min)) * 100
        const passed = isSet && tv <= (effectiveValue as number)
        return (
          <div key={tv} style={{
            position: "absolute", left: `${tp}%`, top: "50%",
            width: 1.5, height: barH, transform: "translate(-50%, -50%)",
            background: passed ? color : "rgba(255,255,255,0.18)",
          }} />
        )
      })}
      {(isSet || liveDrag != null) && (
        <div style={{
          // clamp() не даёт кружку вылезти за границы трека при pct=0 или
          // pct=100 — раньше translate(-50%) уводил половину кружка за
          // левый/правый край, а overflow:hidden выше по дереву обрезал её
          // (баг проявлялся только на минимуме/максимуме шкалы, найден
          // 2026-09-13 при проверке перевода контента на страницах вопросов).
          position: "absolute", left: `clamp(${dotSize / 2}px, ${pct}%, calc(100% - ${dotSize / 2}px))`, top: "50%",
          width: dotSize, height: dotSize, borderRadius: "50%",
          transform: "translate(-50%, -50%)", background: color,
          boxShadow: `0 0 0 2px #0b0d14, 0 0 6px ${color}80`,
          transition: liveDrag != null ? "none" : "left 0.15s",
        }} />
      )}
    </div>
    </div>
  )

  if (variant === "detail") {
    return (
      <DetailRuler
        min={min} max={max} step={step} levels={levels} color={color}
        value={effectiveValue} onChange={interactive ? commit : undefined}
      />
    )
  }

  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      {!hideLabel && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: showLabel ? 8 : 5 }}>
          {showLabel && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9295a5" }}>
              {name}
            </span>
          )}
          <span style={{
            fontSize: showLabel ? 11 : 9, color: isSet ? color : "#9395a5", fontWeight: 600,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {labelText}
          </span>
        </div>
      )}
      <Tooltip text={!showLabel && !hideLabel ? tooltipText : undefined} fullWidth>
        {track}
      </Tooltip>
    </div>
  )
}

function DetailRuler({ min, max, step, levels, color, value, onChange }: {
  min: number; max: number; step: number
  levels?: ScaleLevel[]; color: string
  value: number | null; onChange?: (v: number) => void
}) {
  const [hoverVal, setHoverVal] = useState<number | null>(null)
  const stepCount = Math.max(1, Math.round((max - min) / step))
  const allSteps = Array.from({ length: stepCount + 1 }, (_, i) => min + i * step)
  const tickValues = levels && levels.length > 0
    ? levels.map(l => l.value)
    : allSteps.filter((_, i) => allSteps.length <= 11 || i % Math.ceil(allSteps.length / 10) === 0)

  const pct = (v: number) => ((v - min) / Math.max(1e-9, max - min)) * 100
  const fillPct = value != null ? pct(value) : 0
  const mono = "'JetBrains Mono', 'Fira Code', monospace"

  return (
    <div style={{ position: "relative", height: 64, margin: "38px 22px 0" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 34, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.13)" }} />
      <div style={{
        position: "absolute", left: 0, top: 34, height: 2, borderRadius: 2, width: `${fillPct}%`,
        background: `linear-gradient(90deg, ${color}4d, ${color})`,
        transition: "width 0.35s cubic-bezier(.22,1,.36,1)",
      }} />

      {tickValues.map(tv => {
        const lvl = levelFor(levels, tv)
        const isCurrent = value === tv
        const isPassed = value != null && tv <= value
        const isHover = hoverVal === tv
        const tp = pct(tv)

        return (
          <div
            key={tv}
            onClick={() => onChange?.(tv)}
            onMouseEnter={() => setHoverVal(tv)}
            onMouseLeave={() => setHoverVal(null)}
            style={{ position: "absolute", top: 0, bottom: 0, left: `${tp}%`, transform: "translateX(-50%)", cursor: onChange ? "pointer" : "default" }}
          >
            {lvl?.label && (
              <div style={{
                position: "absolute", bottom: 44, left: "50%", transform: "translateX(-50%)",
                fontSize: 10.5, textAlign: "center", maxWidth: 140, whiteSpace: "nowrap",
                color: isCurrent ? "#f2efe9" : "rgba(242,239,233,0.55)",
                fontWeight: isCurrent ? 600 : 400,
                opacity: isCurrent || isHover ? 1 : 0,
                transition: "opacity 0.15s", pointerEvents: "none",
              }}>
                {lvl.label}
              </div>
            )}

            <div style={{
              position: "absolute", top: 26, left: "50%", transform: "translateX(-50%)",
              width: 1.5, height: 18, background: isPassed ? color : "rgba(255,255,255,0.13)",
              transition: "background 0.15s",
            }} />

            <div style={{
              position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)",
              fontFamily: mono, fontSize: 11, fontVariantNumeric: "tabular-nums", fontWeight: isCurrent ? 700 : isPassed ? 600 : 500,
              color: isCurrent ? color : isPassed ? `${color}cc` : "rgba(242,239,233,0.45)",
            }}>
              {tv}
            </div>

            {isCurrent && (
              <>
                <div style={{
                  position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)",
                  width: 12, height: 12, borderRadius: "50%", background: color,
                  boxShadow: `0 0 0 3px #0b0d14, 0 0 12px 0 ${color}b3`, zIndex: 3,
                }} />
                <div style={{ position: "absolute", top: 12, left: "50%", width: 34, height: 34, transform: "translate(-50%, 0)", pointerEvents: "none" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 9, height: 9, borderTop: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}` }} />
                  <div style={{ position: "absolute", top: 0, right: 0, width: 9, height: 9, borderTop: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: 9, height: 9, borderBottom: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}` }} />
                  <div style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderBottom: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }} />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
