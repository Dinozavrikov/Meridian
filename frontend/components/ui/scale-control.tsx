"use client"
import { useState } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { useT } from "@/lib/i18n/useT"
import { levelFor, useScaleTrack } from "@/lib/use-scale-track"
import type { ScaleLevel } from "@/lib/scales"

export interface ScaleControlProps {
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
}

export function ScaleControl({
  name, value, min, max, color, step = 1, levels,
  size = "sm", showLabel = false, onChange,
}: ScaleControlProps) {
  const t = useT()
  const [hov, setHov] = useState<number | null>(null)
  const { trackRef, liveDrag, effectiveValue, isSet, interactive, commit, trackProps, touchAction } =
    useScaleTrack({ value, min, max, step, onChange })

  const stepCount = Math.max(1, Math.round((max - min) / step))
  const continuous = stepCount > 10

  const segW = size === "lg" ? 44 : 36
  const segH = showLabel
    ? (size === "lg" ? 10 : 8)
    : (size === "lg" ? 8  : 6)
  const barH = showLabel ? (size === "lg" ? 12 : 10) : (size === "lg" ? 10 : 8)

  const display = liveDrag ?? hov ?? (isSet ? (effectiveValue as number) : null)
  const currentLevel = display != null ? levelFor(levels, display) : undefined

  const labelText = isSet
    ? (currentLevel?.label ?? `${effectiveValue}${max > 20 ? "" : "/" + max}`)
    : t("ruler.notSet")

  const tooltipText = isSet
    ? (currentLevel
        ? t("ruler.tooltipWithLevel", { name, value: effectiveValue as number, max, level: currentLevel.label })
        : t("ruler.tooltipWithoutLevel", { name, value: effectiveValue as number, max }))
    : t("ruler.notSetTooltip", { name })

  const continuousPct = (() => {
    const v = liveDrag ?? (isSet ? (effectiveValue as number) : min)
    return ((v - min) / Math.max(1e-9, max - min)) * 100
  })()

  // Внешний div — увеличенная зона касания (+6px сверху и снизу, компенсируется
  // отрицательным margin, чтобы вёрстка не менялась).
  const continuousBar = (
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
      <div style={{
        position: "relative", width: "100%", height: barH,
        borderRadius: barH / 2, background: "rgba(255,255,255,0.14)", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${continuousPct}%`,
          background: isSet || liveDrag != null ? color : "rgba(255,255,255,0.12)",
          borderRadius: barH / 2,
          transition: liveDrag != null ? "none" : "width 0.15s",
        }} />
      </div>
    </div>
  )

  const segmentedBar = (
    <div
      role="group"
      aria-label={name}
      style={{ display: "flex", gap: 3, cursor: interactive ? "pointer" : "default", width: "100%" }}
    >
      {Array.from({ length: stepCount + 1 }).map((_, idx) => {
        const stepIdx = min + idx * step
        const isOn = isSet && stepIdx <= (effectiveValue as number)
        const isHov = hov === stepIdx

        return (
          <div
            key={idx}
            onClick={() => interactive && commit(stepIdx)}
            onMouseEnter={() => interactive && setHov(stepIdx)}
            onMouseLeave={() => interactive && setHov(null)}
            style={{
              flex: showLabel ? 1 : "0 0 auto",
              width: showLabel ? undefined : segW,
              height: isHov ? segH * 1.4 : segH,
              borderRadius: 2,
              background: isOn ? color : "rgba(255,255,255,0.06)",
              border: "none",
              transition: "background 0.1s, height 0.1s",
              alignSelf: "flex-end",
            }}
          />
        )
      })}
    </div>
  )

  const bar = continuous ? continuousBar : segmentedBar

  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: showLabel ? 8 : 5 }}>
        {showLabel && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9295a5" }}>
            {name}
          </span>
        )}
        <span style={{ fontSize: showLabel ? 11 : 9, color: isSet ? color : "#9395a5", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {labelText}
        </span>
      </div>
      <Tooltip text={!showLabel ? tooltipText : undefined} fullWidth>
        {bar}
      </Tooltip>
    </div>
  )
}
