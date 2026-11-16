"use client"
import { useState, useRef, useEffect } from "react"
import { useStore } from "@/lib/store"
import { v2 } from "@/lib/theme"

const BASE_LANGS: { code: string; label: string }[] = [
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
]

// Только для отображения ярлыка в переключателе — сам перевод не
// ограничен этим списком (см. i18n.py::ensure_translations, там нет
// белого списка языков, любой locale уходит в локальную модель и кэшируется).
const LABELS: Record<string, string> = {
  ja: "日本語", zh: "中文", ko: "한국어", de: "DE", fr: "FR", es: "ES",
  it: "IT", pt: "PT", tr: "TR", ar: "AR", hi: "HI", pl: "PL", uk: "UA",
}

function detectBrowserLang(): string | null {
  if (typeof window === "undefined") return null
  const code = (navigator.language || "").slice(0, 2).toLowerCase()
  return code || null
}

type ScopeMode = "ui" | "ui_and_content" | "content"

// Дорожка дуги — статичный спектр teal→amber (интерфейс ←→ контент), не
// "прогресс-бар": средняя точка "Всё" — не промежуточное количество, а
// сочетание обоих концов, поэтому у неё градиентная (не третья произвольная)
// заливка.
const SCOPE_STOPS: { mode: ScopeMode; value: number; label: string }[] = [
  { mode: "ui",             value: 0,   label: "Интерфейс" },
  { mode: "ui_and_content", value: 50,  label: "Всё" },
  { mode: "content",        value: 100, label: "Только контент" },
]

function needleDeg(value: number) {
  return -90 + (value / 100) * 180
}

function stopXY(value: number) {
  const thetaDeg = 180 - (value / 100) * 180
  const theta = (thetaDeg * Math.PI) / 180
  return { x: 80 + 58 * Math.cos(theta), y: 78 - 58 * Math.sin(theta) }
}

function stopFill(mode: ScopeMode): string {
  if (mode === "ui") return v2.teal
  if (mode === "content") return v2.amber
  return "url(#scope-mixed-gradient)"
}

/**
 * Компактная версия дугового gauge из PracticeInstrument (калибровка на
 * дашборде) — та же техника (стрелка, вращаемая через CSS transform), но
 * дорожка теперь статичный градиент-спектр (не strokeDasharray-прогресс —
 * средняя позиция "Всё" не "50% чего-то", а сочетание обоих полюсов, прогресс-
 * бар давал неверное впечатление количества).
 */
function ScopeGauge({ scope, onPick }: { scope: ScopeMode; onPick: (m: ScopeMode) => void }) {
  const current = SCOPE_STOPS.find(s => s.mode === scope) ?? SCOPE_STOPS[0]
  const deg = needleDeg(current.value)

  return (
    <svg width={160} height={78} viewBox="0 0 160 92" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="scope-track-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={v2.teal} />
          <stop offset="100%" stopColor={v2.amber} />
        </linearGradient>
        <linearGradient id="scope-mixed-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={v2.teal} />
          <stop offset="100%" stopColor={v2.amber} />
        </linearGradient>
      </defs>
      <path d="M 22 78 A 58 58 0 0 1 138 78" fill="none" stroke="url(#scope-track-gradient)" strokeWidth={6} strokeLinecap="round" opacity={0.55} />
      <g style={{
        transformOrigin: "80px 78px",
        transform: `rotate(${deg}deg)`,
        transition: "transform 0.35s cubic-bezier(.2,.9,.25,1)",
      }}>
        <line x1={80} y1={78} x2={80} y2={32} stroke={v2.t1} strokeWidth={1.6} />
        <circle cx={80} cy={78} r={4} fill={v2.t1} />
      </g>
      {SCOPE_STOPS.map(s => {
        const { x, y } = stopXY(s.value)
        const active = s.mode === scope
        return (
          <g key={s.mode} style={{ cursor: "pointer" }} onClick={() => onPick(s.mode)}>
            <circle cx={x} cy={y} r={14} fill="transparent" />
            <circle
              cx={x} cy={y} r={active ? 6 : 3.5}
              fill={active ? stopFill(s.mode) : v2.bd2}
              stroke={active ? v2.bg : "none"} strokeWidth={active ? 1.5 : 0}
              style={{ transition: "all 0.15s" }}
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Список языков — русский и английский всегда, плюс язык браузера
 * пользователя третьим пунктом, если он не ru/en (например, японский).
 * Перевод для него не захардкожен — переводится на лету через локальную модель
 * при первом обращении и кэшируется на бэкенде (ensure_translations).
 */
export function LocaleSwitcher() {
  const locale = useStore(s => s.locale)
  const setLocale = useStore(s => s.setLocale)
  const scope = useStore(s => s.translationScope)
  const setScope = useStore(s => s.setTranslationScope)
  const [open, setOpen] = useState(false)
  const [hov, setHov] = useState(false)
  const [browserLang, setBrowserLang] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBrowserLang(detectBrowserLang())
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [open])

  const langs = [...BASE_LANGS]
  if (browserLang && browserLang !== "ru" && browserLang !== "en") {
    langs.push({ code: browserLang, label: LABELS[browserLang] ?? browserLang.toUpperCase() })
  }

  const current = langs.find(l => l.code === locale) ?? langs[0]
  const scopeDotFill = stopFill(scope)
  const glyphColor = open ? v2.teal : hov ? v2.t1 : v2.t2

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="scope-mixed-gradient-trigger" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={v2.teal} />
            <stop offset="100%" stopColor={v2.amber} />
          </linearGradient>
        </defs>
      </svg>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: open ? v2.surf2 : "transparent",
          border: `0.5px solid ${open ? v2.teal + "40" : v2.bd2}`, borderRadius: 8,
          padding: "6px 9px", color: glyphColor, fontSize: 11.5,
          fontFamily: v2.fontMono, cursor: "pointer",
          transition: "border-color 0.15s, color 0.15s",
        }}
        aria-label="Язык и режим перевода"
      >
        <svg width={7} height={7} viewBox="0 0 7 7" style={{ flexShrink: 0 }}>
          <circle cx={3.5} cy={3.5} r={3.5} fill={scope === "ui_and_content" ? "url(#scope-mixed-gradient-trigger)" : scopeDotFill} />
        </svg>
        <span>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: v2.surf, border: `0.5px solid ${v2.bd2}`,
          borderRadius: 12, padding: "14px 16px 12px", minWidth: 210, zIndex: 200,
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${v2.teal}, ${v2.amber})`, opacity: 0.6,
          }} />

          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: v2.t3, marginBottom: 2 }}>
            Что переводить
          </div>
          <ScopeGauge scope={scope} onPick={setScope} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: -6, marginBottom: 12, padding: "0 2px", gap: 6 }}>
            {SCOPE_STOPS.map((s, i) => {
              const active = s.mode === scope
              const color = active ? (s.mode === "ui_and_content" ? v2.t1 : stopFill(s.mode)) : v2.t3
              return (
                <span
                  key={s.mode}
                  onClick={() => setScope(s.mode)}
                  style={{
                    fontSize: 10, fontFamily: v2.fontMono, cursor: "pointer",
                    color, fontWeight: active ? 600 : 400,
                    textAlign: i === 0 ? "left" : i === SCOPE_STOPS.length - 1 ? "right" : "center",
                    transition: "color 0.15s", whiteSpace: "nowrap",
                  }}
                >
                  {s.label}
                </span>
              )
            })}
          </div>

          <div style={{ height: 0.5, background: v2.bd, margin: "0 -16px 12px" }} />

          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: v2.t3, marginBottom: 8 }}>
            Язык интерфейса
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {langs.map(l => {
              const selected = l.code === locale
              return (
                <button
                  key={l.code}
                  onClick={() => { setLocale(l.code); setOpen(false) }}
                  style={{
                    fontSize: 11.5, padding: "5px 12px", borderRadius: 20,
                    border: `1px solid ${selected ? v2.teal : v2.bd2}`,
                    background: selected ? `${v2.teal}18` : "transparent",
                    color: selected ? v2.teal : v2.t2,
                    fontWeight: selected ? 600 : 400, fontFamily: v2.fontMono,
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {l.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
