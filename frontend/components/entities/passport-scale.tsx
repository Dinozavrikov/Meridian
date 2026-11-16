"use client"
import { X } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ink, theme } from "@/lib/theme"
import { levelFor, useScaleTrack } from "@/lib/use-scale-track"
import type { Scale } from "@/lib/scales"

interface PassportScaleProps {
  scale: Scale
  value: number | null | undefined
  locked?: boolean
  lockedHint?: string
  /** без onChange шкала только для чтения (чужая запись или заблокированная шкала) */
  onChange?: (v: number) => void
  /** без onClear кнопки «сбросить» нет (нечего сбрасывать, не владелец или шкала не хранит «пусто») */
  onClear?: () => void
}

const OFF = "#4a5178"  // контур не заполненных делений (декоративный)

export function formatValue(v: number, max: number) { return max === 100 ? `${v}%` : `${v}/${max}` }

export function PassportScale({ scale, value, locked = false, lockedHint, onChange, onClear }: PassportScaleProps) {
  const t = useT()
  const { min, max, step, color, levels, name } = scale
  const count = Math.max(1, Math.round((max - min) / step))
  const continuous = count > 10
  const { trackRef, liveDrag, effectiveValue, isSet, interactive, trackProps, touchAction } =
    useScaleTrack({ value, min, max, step, onChange, segmented: !continuous })

  const shown = liveDrag ?? (isSet ? (effectiveValue as number) : null)
  const unrated = shown == null
  const level = shown != null ? levelFor(levels, shown) : undefined
  const readout = shown != null ? (level?.label ?? String(shown)) : t("passport.unrated")
  const pct = shown != null ? ((shown - min) / Math.max(1e-9, max - min)) * 100 : 0

  const sliderProps = {
    ref: trackRef, role: "slider", "aria-label": name,
    "aria-valuemin": min, "aria-valuemax": max,
    "aria-valuenow": shown != null ? shown : undefined,
    "aria-valuetext": readout,
    ...trackProps,
  } as const
  const hitArea = {
    padding: interactive ? "8px 0" : 0, margin: interactive ? "-8px 0" : 0,
    cursor: interactive ? "pointer" : "default", touchAction,
  }

  const track = continuous ? (
    <div {...sliderProps} style={{ position: "relative", ...hitArea }}>
      <div style={{
        height: 8, borderRadius: 4, boxSizing: "border-box", overflow: "hidden",
        background: ink.well, border: `1px solid ${unrated ? OFF : "transparent"}`,
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: liveDrag != null ? "none" : "width 0.15s" }} />
      </div>
    </div>
  ) : (
    <div {...sliderProps} style={{ display: "flex", gap: 3, ...hitArea }}>
      {Array.from({ length: count + 1 }).map((_, i) => {
        const on = shown != null && min + i * step <= shown
        return (
          <span key={i} aria-hidden style={{
            flex: 1, height: 8, borderRadius: 3, boxSizing: "border-box",
            background: on ? color : ink.well,
            border: `1px solid ${on ? color : OFF}`,
            transition: "background 0.1s",
          }} />
        )
      })}
    </div>
  )

  return (
    <div title={locked ? lockedHint : undefined} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6, opacity: locked ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 26 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink.label }}>{name}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {shown != null && (
            <span style={{ fontFamily: theme.mono, fontSize: 12, color: ink.muted }}>{formatValue(shown, max)}</span>
          )}
          {onClear && isSet && (
            <button
              type="button" onClick={onClear}
              aria-label={`${t("passport.clear")}: ${name}`} title={t("passport.clear")}
              style={{
                width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6, border: `1px solid ${ink.line}`, background: "transparent", color: ink.muted, cursor: "pointer",
              }}
            >
              <X size={12} />
            </button>
          )}
        </span>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 600, lineHeight: 1.3,
        color: unrated ? ink.muted : color, fontStyle: unrated ? "italic" : "normal",
      }}>
        {readout}
      </div>
      {track}
      {level?.desc && shown != null && (
        <div style={{ fontSize: 12, lineHeight: 1.4, color: ink.muted }}>{level.desc}</div>
      )}
    </div>
  )
}
