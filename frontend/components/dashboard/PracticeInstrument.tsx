"use client"
import type { CSSProperties } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { v2 } from "@/lib/theme"
import { Eye, Lightbulb, TrendingUp, Globe, HelpCircle, CheckSquare } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

export type Totals = {
  observations?: number
  hypotheses?: number
  predictions?: number
  worldview?: number
  questions?: number
  tasks?: number
}

export type PracticeRank = {
  level_index: number
  label: string
  next_label: string | null
  progress_pct: number
  sample_size: number
} | null

interface Props {
  totals: Totals
  accuracy: number | null
  checked: number
  streakDays: number
  rank: PracticeRank
  deletedUnverified: number
}

const CX = 280, CY = 190, R_IN = 88, R_OUT = 148
const rad = (deg: number) => (deg * Math.PI) / 180
const posAt = (r: number, deg: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) })

function anchorFor(deg: number): "start" | "middle" | "end" {
  const a = ((deg % 360) + 360) % 360
  if (a > 60 && a < 120) return "middle"
  if (a > 240 && a < 300) return "middle"
  return a > 300 || a < 60 ? "start" : "end"
}
function dyFor(deg: number): number {
  const a = ((deg % 360) + 360) % 360
  if (a > 60 && a < 120) return -10
  if (a > 240 && a < 300) return 18
  return 4
}

const NODES = [
  { key: "observations", labelKey: "nav.data.observations", href: "/observations", angle: 90,  orbit: "inner" as const, color: v2.teal,   icon: Eye },
  { key: "hypotheses",   labelKey: "nav.data.hypotheses",   href: "/hypotheses",   angle: 210, orbit: "inner" as const, color: v2.violet, icon: Lightbulb },
  { key: "predictions",  labelKey: "nav.data.predictions",  href: "/predictions",  angle: 330, orbit: "inner" as const, color: v2.amber,  icon: TrendingUp },
  { key: "worldview",    labelKey: "nav.data.worldview",    href: "/worldview",    angle: 30,  orbit: "outer" as const, color: v2.t2,     icon: Globe },
  { key: "questions",    labelKey: "nav.data.questions",    href: "/questions",    angle: 150, orbit: "outer" as const, color: v2.t2,     icon: HelpCircle },
  { key: "tasks",        labelKey: "nav.analysis.tasks",    href: "/tasks",        angle: 270, orbit: "outer" as const, color: v2.t2,     icon: CheckSquare },
]

const miniLabel: CSSProperties = {
  fontSize: 9, textTransform: "uppercase", letterSpacing: "0.09em", color: v2.t3, marginBottom: 3,
}

export function PracticeInstrument({ totals, accuracy, checked, streakDays, rank, deletedUnverified }: Props) {
  const t = useT()
  const total = Object.values(totals).reduce((s, v) => s + (v ?? 0), 0)

  return (
    <div style={{
      background: v2.surf, border: `0.5px solid ${v2.bd}`, borderRadius: 14,
      padding: "30px 32px", position: "relative", overflow: "hidden",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${v2.teal}, ${v2.violet}, ${v2.amber})`, opacity: 0.55,
      }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 480px 280px at 10% 15%, ${v2.teal}10, transparent 70%)`,
      }} />
      <div className="dash-instrument-row" style={{ position: "relative" }}>
        <div style={{ flex: "0 1 auto", width: "100%", maxWidth: 300, margin: "0 auto", textAlign: "center" }}>
          <Gauge value={accuracy} t={t} />
          <div style={{ fontFamily: v2.fontMono, fontSize: 10, color: v2.t3, marginTop: 6 }}>
            {checked > 0 ? t("instrument.checkedCount", { n: checked }) : t("instrument.notCheckedYet")}
          </div>
          {deletedUnverified > 0 && (
            <div style={{ fontFamily: v2.fontMono, fontSize: 9.5, color: v2.t3, marginTop: 2 }}>
              {t("instrument.deletedUnverified", { n: deletedUnverified })}
            </div>
          )}
        </div>

        <div style={{ flex: "0 1 auto", width: "100%", maxWidth: 440, margin: "0 auto" }}>
          {total === 0 ? <EmptyOrbit t={t} /> : <OrbitCluster totals={totals} t={t} />}
        </div>

        <RankStrip rank={rank} streakDays={streakDays} t={t} />
      </div>
    </div>
  )
}

function Gauge({ value, t }: { value: number | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const has = value !== null
  const v = value ?? 0
  const color = !has ? v2.t3 : v >= 60 ? v2.teal : v >= 40 ? v2.amber : v2.red
  const deg = -90 + (v / 100) * 180

  return (
    <svg width={300} height={170} viewBox="0 0 300 170" style={{ width: "100%", height: "auto", maxWidth: 300, display: "block" }}>
      <path d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke={v2.bd2} strokeWidth={14} strokeLinecap="round" />
      <path
        d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke={color} strokeWidth={14}
        strokeLinecap="round" pathLength={100} strokeDasharray={`${has ? v : 0} 100`}
        style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.9,.25,1)" }}
      />
      <g style={{
        transformOrigin: "150px 150px",
        transform: `rotate(${has ? deg : -90}deg)`,
        transition: "transform 1s cubic-bezier(.2,.9,.25,1)",
      }}>
        <line x1={150} y1={150} x2={150} y2={48} stroke={v2.t1} strokeWidth={2} />
        <circle cx={150} cy={150} r={6} fill={v2.t1} />
      </g>
      <text x={150} y={122} textAnchor="middle" fontFamily={v2.fontMono} fontSize={30} fontWeight={600} fill={color}>
        {has ? `${v}%` : "—"}
      </text>
      <text x={150} y={140} textAnchor="middle" fontFamily={v2.fontSerif} fontSize={11} fill={v2.t3}>
        {t("instrument.calibrationAccuracy")}
      </text>
    </svg>
  )
}

function EmptyOrbit({ t }: { t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div style={{
      height: 300, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 10, textAlign: "center",
    }}>
      <svg width={60} height={60} viewBox="0 0 60 60">
        <circle cx={30} cy={30} r={24} fill="none" stroke={v2.bd2} strokeWidth={1} strokeDasharray="3 6" />
        <circle cx={30} cy={30} r={4} fill={v2.teal} />
      </svg>
      <div style={{ fontSize: 13, color: v2.t2, maxWidth: 260 }}>
        {t("instrument.emptyOrbit.title")}
      </div>
      <Link href="/observations" style={{
        fontSize: 12, color: v2.teal, border: "0.5px solid rgba(77,207,166,0.35)",
        borderRadius: 7, padding: "6px 14px", background: "rgba(77,207,166,0.08)",
      }}>
        + {t("instrument.emptyOrbit.action")}
      </Link>
    </div>
  )
}

function OrbitCluster({ totals, t }: { totals: Totals; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const router = useRouter()
  const circlePath = `M ${CX - R_OUT} ${CY} a ${R_OUT} ${R_OUT} 0 1 0 ${R_OUT * 2} 0 a ${R_OUT} ${R_OUT} 0 1 0 ${-R_OUT * 2} 0`

  return (
    <svg width={560} height={420} viewBox="0 0 560 420" style={{ width: "100%", maxWidth: 440, height: "auto", display: "block", margin: "0 auto" }}>
      <circle cx={CX} cy={CY} r={R_IN} fill="none" stroke={v2.bd} strokeWidth={1} strokeDasharray="2 6" />
      <circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke={v2.bd} strokeWidth={1} strokeDasharray="1 7" />

      {Array.from({ length: 24 }).map((_, i) => {
        const a = i * 15
        if (NODES.some(n => Math.abs(((a - n.angle + 540) % 360) - 180) < 8)) return null
        const inner = posAt(R_OUT - 5, a)
        const outer = posAt(R_OUT + 5, a)
        return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={v2.bd2} strokeWidth={1} />
      })}

      <circle
        r={3} fill={v2.teal} className="meridian-pulse"
        style={{ offsetPath: `path('${circlePath}')`, animationDuration: "7s" }}
      />

      <g className="orbit-core" style={{ cursor: "pointer" }} onClick={() => router.push("/graph")}>
        <circle className="orbit-core-glow" cx={CX} cy={CY} r={44} fill={`${v2.teal}0d`} />
        <circle className="orbit-core-ring" cx={CX} cy={CY} r={34} fill={v2.bg} stroke={v2.bd2} strokeWidth={1} />
        <circle cx={CX} cy={CY} r={20} fill="none" stroke={v2.teal} strokeWidth={1.4} />
        <path d={`M ${CX - 15} ${CY} L ${CX + 15} ${CY} M ${CX} ${CY - 15} L ${CX} ${CY + 15}`} stroke={v2.teal} strokeWidth={1} opacity={0.5} />
        <path d={`M ${CX - 12} ${CY - 6} A 14 14 0 0 1 ${CX + 12} ${CY - 6}`} fill="none" stroke={v2.violet} strokeWidth={1.6} strokeLinecap="round" />
        <text x={CX} y={CY + 32} textAnchor="middle" fontFamily={v2.fontMono} fontSize={9} fill={v2.t3}>
          {t("instrument.graphLabel")}
        </text>
      </g>

      {NODES.map(n => {
        const orbitR = n.orbit === "inner" ? R_IN : R_OUT
        const { x, y } = posAt(orbitR, n.angle)
        const count = (totals as Record<string, number | undefined>)[n.key] ?? 0
        const empty = count === 0
        const radius = empty ? 12 : Math.min(13 + Math.sqrt(count) * 3.6, 30)
        const label = posAt(orbitR + radius + 20, n.angle)
        const anchor = anchorFor(n.angle)
        const dy = dyFor(n.angle)

        return (
          <g key={n.key} style={{ cursor: "pointer" }} onClick={() => router.push(n.href)}>
            {empty ? (
              <circle cx={x} cy={y} r={radius} fill="none" stroke={v2.bd2} strokeWidth={1.4} strokeDasharray="2 4" />
            ) : (
              <circle cx={x} cy={y} r={radius} fill={n.color} fillOpacity={n.orbit === "inner" ? 0.85 : 0.45} />
            )}
            <text
              x={x} y={y + 5} textAnchor="middle" fontFamily={v2.fontMono} fontWeight={600}
              fontSize={empty ? 10 : Math.min(11 + radius * 0.32, 17)}
              fill={empty ? v2.t3 : n.orbit === "inner" ? "#08110d" : v2.t1}
            >
              {empty ? "+" : count}
            </text>
            <text x={label.x} y={label.y + dy} textAnchor={anchor} fontFamily={v2.fontSerif} fontWeight={400} fontSize={13.5} fill={v2.t2}>
              {t(n.labelKey)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function RankStrip({ rank, streakDays, t }: { rank: PracticeRank; streakDays: number; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, background: v2.surf2,
      border: `0.5px solid ${v2.bd}`, borderRadius: 10, padding: "12px 18px", flexShrink: 0,
    }}>
      <div>
        <div style={miniLabel}>{t("instrument.rankLabel")}</div>
        <div style={{ fontFamily: v2.fontSerif, fontStyle: "italic", fontSize: 15, fontWeight: 500, color: rank ? v2.violet : v2.t3 }}>
          {rank ? t(`rank.${rank.level_index}`) : t("instrument.noHypotheses")}
        </div>
        {rank?.next_label && (
          <div style={{ fontSize: 10, color: v2.t3, marginTop: 2 }}>
            {t("instrument.progressTo", { pct: rank.progress_pct, next: t(`rank.${rank.level_index + 1}`) })}
          </div>
        )}
      </div>
      <div style={{ width: 0.5, height: 28, background: v2.bd2 }} />
      <div>
        <div style={miniLabel}>{t("instrument.streakLabel")}</div>
        <div style={{ fontFamily: v2.fontMono, fontSize: 14, fontWeight: 600, color: streakDays > 0 ? v2.amber : v2.t3 }}>
          {streakDays > 0 ? t("instrument.streakDays", { n: streakDays }) : t("instrument.streakStart")}
        </div>
      </div>
    </div>
  )
}
