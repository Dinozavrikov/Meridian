"use client"
import type { ReactNode } from "react"
import { Gauge, Layers, EyeOff, Target, RefreshCw, Brain, type LucideIcon } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { pluralKey } from "@/lib/i18n/ru-plural"
import { ENTITY_ROUTES } from "@/lib/entity-routes"
import { STAGE_VALUES, stageLabel } from "@/lib/stage-labels"
import { VISIBILITY_LEVELS } from "@/lib/visibility-levels"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"
import { TYPE_COLORS } from "@/lib/utils"
import { v2 } from "@/lib/theme"
import {
  COMPUTE_IDS, COUNT_BASES, MATURITY_PENDING_KEY, RECORDS_KEYS, SECTION_KEYS, STEP_IDS, STEP_TYPE,
  computeExampleKey, computeKeys, stepExampleKey, stepKeys, visKey, type ComputeId,
} from "@/lib/site/home"
import { HomeSection, cardStyle, h3Style, pStyle } from "@/components/site/home-section"
import { useMaturityRange } from "@/components/site/use-maturity-range"
import { HomeExample } from "@/components/site/home-example"

const COMPUTE_ICON: Record<ComputeId, LucideIcon> = {
  maturity: Gauge, independence: Layers, blind: EyeOff, calibration: Target, contradictions: RefreshCw, patterns: Brain,
}
const COMPUTE_COLOR: Record<ComputeId, string> = {
  maturity: v2.teal, independence: TYPE_COLORS.hypothesis, blind: v2.amber, calibration: TYPE_COLORS.prediction, contradictions: v2.red, patterns: v2.violet,
}

const grid = (min: number) => ({ display: "grid", gap: 16, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }) as const
const list = { listStyle: "none", margin: 0, padding: 0 } as const

export function HomeSteps() {
  const t = useT()
  return (
    <HomeSection title={t(SECTION_KEYS.steps.title)} lead={t(SECTION_KEYS.steps.lead)}>
      <ol style={{ ...list, ...grid(230) }}>
        {STEP_IDS.map((id, i) => {
          const color = TYPE_COLORS[STEP_TYPE[id]] ?? v2.teal
          const k = stepKeys(id)
          return (
            <li key={id} style={cardStyle}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 13, fontWeight: 700, color, background: `${color}22` }}>{i + 1}</div>
              <h3 style={h3Style}>{t(k.title)}</h3>
              <p style={pStyle}>{t(k.text)}</p>
              <HomeExample k={stepExampleKey(id)} />
            </li>
          )
        })}
      </ol>
    </HomeSection>
  )
}

export function HomeComputes() {
  const t = useT()
  const range = useMaturityRange()
  // Число уровней приходит из модели зрелости на сервере (единый источник): руками в тексте его нет.
  const title = (id: ComputeId) => {
    if (id !== "maturity") return t(computeKeys(id).title)
    return range ? t(computeKeys(id).title, { min: range.min, max: range.max }) : t(MATURITY_PENDING_KEY)
  }
  return (
    <HomeSection title={t(SECTION_KEYS.computes.title)} lead={t(SECTION_KEYS.computes.lead)}>
      <ul style={{ ...list, ...grid(300) }}>
        {COMPUTE_IDS.map(id => {
          const Icon = COMPUTE_ICON[id]
          const color = COMPUTE_COLOR[id]
          return (
            <li key={id} style={cardStyle}>
              <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, color, background: `${color}1c` }}>
                <Icon size={18} />
              </div>
              <h3 style={h3Style}>{title(id)}</h3>
              <p style={pStyle}>{t(computeKeys(id).text)}</p>
              <HomeExample k={computeExampleKey(id)} />
            </li>
          )
        })}
      </ul>
    </HomeSection>
  )
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, fontSize: 13, color, background: `${color}14`, border: `1px solid ${color}40` }}>
      {children}
    </span>
  )
}

const chips = { display: "flex", flexWrap: "wrap", gap: 8 } as const
const subTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 600, color: v2.t1 } as const
const caption = { margin: "0 0 10px", fontSize: 14, lineHeight: 1.6, color: v2.t2 } as const

export function HomeRecords() {
  const t = useT()
  const types = Object.keys(ENTITY_ROUTES)
  const count = Object.keys(ENTITY_ROUTES).length
  return (
    <HomeSection title={t(SECTION_KEYS.records.title)} lead={t(SECTION_KEYS.records.lead)}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={subTitle}>{t(pluralKey(COUNT_BASES.records, count), { n: count })}</h3>
          <div style={{ ...chips, marginBottom: 16 }}>
            {types.map(type => <Chip key={type} color={TYPE_COLORS[type] ?? v2.t3}>{t(`entityType.${type}`)}</Chip>)}
          </div>
          <p style={caption}>{t(RECORDS_KEYS.influence)}</p>
          <div style={chips}>
            {WORLDVIEW_INFLUENCE.map(i => <Chip key={i.value} color={i.color}>{t(i.labelKey)}</Chip>)}
          </div>
        </div>
        <div style={cardStyle}>
          <h3 style={subTitle}>{t(pluralKey(COUNT_BASES.stages, STAGE_VALUES.length), { n: STAGE_VALUES.length })}</h3>
          <p style={caption}>{t(RECORDS_KEYS.stagesText)}</p>
          <div style={chips}>
            {STAGE_VALUES.map((s, i) => <Chip key={s} color={v2.teal}>{`${i + 1}. ${stageLabel(t, s)}`}</Chip>)}
          </div>
        </div>
        <div style={cardStyle}>
          <h3 style={subTitle}>{t(pluralKey(COUNT_BASES.visibility, VISIBILITY_LEVELS.length), { n: VISIBILITY_LEVELS.length })}</h3>
          <div style={{ ...chips, marginBottom: 12 }}>
            {VISIBILITY_LEVELS.map(l => <Chip key={l.value} color={l.color}><l.icon size={14} />{t(visKey(l.value))}</Chip>)}
          </div>
          <p style={{ ...caption, margin: "0 0 6px" }}>{t(RECORDS_KEYS.visText)}</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: v2.t3 }}>{t(RECORDS_KEYS.labNote)}</p>
        </div>
      </div>
    </HomeSection>
  )
}
