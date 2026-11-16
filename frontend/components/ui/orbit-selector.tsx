"use client"
import React, { useState, useRef, useEffect } from "react"
import { ChevronDown, RotateCcw, Check, Globe, FlaskConical, Lock } from "lucide-react"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { VISIBILITY_LEVELS, type VisibilityValue } from "@/lib/visibility-levels"

// re-export для обратной совместимости — другие файлы уже импортируют
// VisibilityValue/VISIBILITY_LEVELS отсюда, менять все их импорты не нужно;
// источник истины теперь lib/visibility-levels.ts (переиспользуется и в
// новом VisibilityTabs на списковых страницах)
export { VISIBILITY_LEVELS, type VisibilityValue }
const RING_ORDER: VisibilityValue[] = ["public", "lab", "private"]

function getVisibilityLevels(t: (key: string) => string) {
  return [
    { value: "public"  as const, label: t("visibility.public"),  desc: t("visibility.public.desc"),  icon: Globe,        color: "#27AE60" },
    { value: "lab"      as const, label: t("visibility.lab"),     desc: t("visibility.lab.desc"),     icon: FlaskConical, color: "#4A90D9" },
    { value: "private"  as const, label: t("visibility.private"), desc: t("visibility.private.desc"), icon: Lock,         color: "#9999a6" },
  ]
}

interface OrbitSelectorProps {
  active: VisibilityValue[]
  onChange: (v: VisibilityValue[]) => void
  labs?: { id: number; name: string }[]
  activeLabId?: number | null
  onLabChange?: (id: number | null) => void
  size?: number
  availableRings?: VisibilityValue[]
  /** popover-режим: компактный триггер + попап с чекбоксами (для тесных мест типа шапки профиля) */
  popover?: boolean
}

function DecorativeOrbit({ size, ringsToShow, active, allOn }: {
  size: number; ringsToShow: VisibilityValue[]; active: VisibilityValue[]; allOn: boolean
}) {
  const gap = size * 0.16
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {ringsToShow.map((v, i) => {
        const level = VISIBILITY_LEVELS.find(l => l.value === v)!
        const isOn = allOn || active.includes(v)
        return (
          <div key={v} style={{
            position: "absolute", inset: i * gap, borderRadius: "50%",
            border: `1.5px solid ${isOn ? level.color : level.color + "35"}`,
            background: isOn && v === "private" ? level.color + "18" : "transparent",
          }} />
        )
      })}
    </div>
  )
}

// ── Inline-режим: кольца + подписи всегда видны (используется на страницах списков) ──
function InlineSelector({ active, onChange, labs, activeLabId, onLabChange, size, availableRings }: Required<Pick<OrbitSelectorProps, "active" | "onChange">> & OrbitSelectorProps) {
  const t = useT()
  const levels = getVisibilityLevels(t)
  const [labMenuOpen, setLabMenuOpen] = useState(false)
  const allOn = active.length === 0
  const rings = RING_ORDER.filter(v => (availableRings ?? RING_ORDER).includes(v))

  const toggle = (v: VisibilityValue) => {
    if (allOn) { onChange(rings.filter(x => x !== v)); return }
    if (active.includes(v)) { onChange(active.filter(x => x !== v)) }
    else {
      const next = [...active, v]
      onChange(next.length === rings.length ? [] : next)
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <DecorativeOrbit size={size ?? 46} ringsToShow={rings} active={active} allOn={allOn} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rings.map(v => {
          const level = levels.find(l => l.value === v)!
          const isOn = allOn || active.includes(v)
          const Icon = level.icon
          return (
            <div key={v} onClick={() => toggle(v)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", opacity: isOn ? 1 : 0.4 }}>
              <Icon size={11} style={{ color: level.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: isOn ? v2.t1 : v2.t3 }}>{level.label}</span>
            </div>
          )
        })}
        {(allOn || active.includes("lab")) && labs && labs.length > 0 && onLabChange && (
          <div style={{ position: "relative", marginTop: 2 }}>
            <div onClick={() => setLabMenuOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: v2.t3, cursor: "pointer", padding: "2px 6px", borderRadius: 5, border: `1px solid ${v2.bd2}`, width: "fit-content" }}>
              {activeLabId ? labs.find(l => l.id === activeLabId)?.name ?? t("visibility.lab") : t("labs.allLabs")}
              <ChevronDown size={9} />
            </div>
            {labMenuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 8, padding: 4, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                <div onClick={() => { onLabChange(null); setLabMenuOpen(false) }} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 5, cursor: "pointer", color: v2.t2 }}>{t("labs.allLabs")}</div>
                {labs.map(l => (
                  <div key={l.id} onClick={() => { onLabChange(l.id); setLabMenuOpen(false) }} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 5, cursor: "pointer", color: activeLabId === l.id ? v2.t1 : v2.t2, background: activeLabId === l.id ? v2.surf2 : "transparent" }}>{l.name}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Popover-режим: чип + попап с крупными чекбоксами (для тесных мест) ──
function PopoverSelector({ active, onChange, labs, activeLabId, onLabChange, availableRings }: OrbitSelectorProps) {
  const t = useT()
  const levels = getVisibilityLevels(t)
  const [open, setOpen] = useState(false)
  const [labMenuOpen, setLabMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allOn = active.length === 0
  const rings = RING_ORDER.filter(v => (availableRings ?? RING_ORDER).includes(v))

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [open])

  const toggle = (v: VisibilityValue) => {
    if (allOn) { onChange(rings.filter(x => x !== v)); return }
    if (active.includes(v)) { onChange(active.filter(x => x !== v)) }
    else {
      const next = [...active, v]
      onChange(next.length === rings.length ? [] : next)
    }
  }

  const summaryText = allOn ? t("visibility.all") : (rings.filter(v => active.includes(v)).map(v => levels.find(l => l.value === v)!.label).join(" + ") || t("visibility.none"))

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 11,
        border: `1px solid ${open ? "rgba(77,207,166,0.35)" : "rgba(255,255,255,0.08)"}`,
        background: "rgba(255,255,255,0.02)", cursor: "pointer", userSelect: "none", transition: "border-color 0.15s",
      }}>
        <span style={{ fontSize: 10, color: v2.t3, whiteSpace: "nowrap" }}>{t("visibility.showing")}</span>
        <DecorativeOrbit size={20} ringsToShow={rings} active={active} allOn={allOn} />
        <span style={{ fontSize: 11, color: v2.t2, whiteSpace: "nowrap" }}>{summaryText}</span>
        <ChevronDown size={11} style={{ color: v2.t3, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
          background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 12,
          padding: 8, width: 230, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        }}>
          {rings.map(v => {
            const level = levels.find(l => l.value === v)!
            const isOn = allOn || active.includes(v)
            const Icon = level.icon
            return (
              <React.Fragment key={v}>
                <div onClick={() => toggle(v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 8, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v2.surf2}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <div style={{
                    width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${isOn ? level.color : v2.bd2}`,
                    background: isOn ? level.color + "25" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isOn && <Check size={10} style={{ color: level.color }} />}
                  </div>
                  <Icon size={13} style={{ color: level.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: v2.t1 }}>{level.label}</div>
                    <div style={{ fontSize: 10, color: v2.t3 }}>{level.desc}</div>
                  </div>
                </div>
                {v === "lab" && isOn && labs && labs.length > 0 && onLabChange && (
                  <div style={{ position: "relative", padding: "2px 9px 6px 33px" }}>
                    <div onClick={() => setLabMenuOpen(o => !o)} style={{ fontSize: 11, color: v2.t3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {t("visibility.lab")}: {activeLabId ? labs.find(l => l.id === activeLabId)?.name ?? "?" : t("labs.allLabsShort")} <ChevronDown size={9} />
                    </div>
                    {labMenuOpen && (
                      <div style={{ position: "absolute", top: "100%", left: 33, zIndex: 60, background: v2.bg, border: `1px solid ${v2.bd2}`, borderRadius: 8, padding: 4, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                        <div onClick={() => { onLabChange(null); setLabMenuOpen(false) }} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 5, cursor: "pointer", color: v2.t2 }}>{t("labs.allLabs")}</div>
                        {labs.map(l => (
                          <div key={l.id} onClick={() => { onLabChange(l.id); setLabMenuOpen(false) }} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 5, cursor: "pointer", color: activeLabId === l.id ? v2.t1 : v2.t2 }}>{l.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            )
          })}
          <div style={{ height: 1, background: v2.bd, margin: "6px 4px" }} />
          <div onClick={() => { onChange([]); onLabChange?.(null) }} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, color: v2.teal,
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = v2.surf2}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
          >
            <RotateCcw size={11} /> {t("visibility.resetShowAll")}
          </div>
        </div>
      )}
    </div>
  )
}

export function OrbitSelector(props: OrbitSelectorProps) {
  return props.popover ? <PopoverSelector {...props} /> : <InlineSelector {...(props as any)} />
}
