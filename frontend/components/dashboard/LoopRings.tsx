"use client"
import { PreviewLink } from "@/components/entities/preview-link"
import { entityHref } from "@/lib/entity-routes"
import { v2 } from "@/lib/theme"
import { Card } from "./primitives"
import { CheckCircle } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

export interface LoopItem { id: number; name?: string; title?: string }
export interface LoopsData {
  hyps_no_obs: LoopItem[]
  hyps_no_pred: LoopItem[]
  preds_no_date: LoopItem[]
  questions_no_answer: LoopItem[]
  worldview_no_reflection: LoopItem[]
}

const GROUPS: { key: keyof LoopsData; titleKey: string; type: "hypothesis" | "worldview" | "question"; color: string }[] = [
  { key: "hyps_no_obs",             titleKey: "loops.noObs",        type: "hypothesis", color: v2.amber },
  { key: "hyps_no_pred",            titleKey: "loops.noPred",       type: "hypothesis", color: v2.violet },
  { key: "worldview_no_reflection", titleKey: "loops.noReflection", type: "worldview", color: "#4A90D9" },
  { key: "questions_no_answer",     titleKey: "loops.noAnswer",     type: "question", color: v2.violet },
]

function Ring({ count, max, color }: { count: number; max: number; color: string }) {
  const circumference = 113 // 2πr при r=18
  const closed = count === 0
  const gap = closed ? 0 : Math.min((count / max) * circumference * 0.55, circumference * 0.4)
  return (
    <svg width={46} height={46} viewBox="0 0 46 46">
      <circle
        cx={23} cy={23} r={18} fill="none" stroke={closed ? v2.teal : color} strokeWidth={3}
        strokeDasharray={`${circumference - gap} ${gap}`} strokeLinecap="round"
        transform="rotate(-90 23 23)"
      />
    </svg>
  )
}

export function LoopRings({ loops, total }: { loops: LoopsData; total: number }) {
  const t = useT()
  if (total === 0) {
    return (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 0" }}>
          <svg width={52} height={52} viewBox="0 0 52 52">
            <circle cx={26} cy={26} r={20} fill="none" stroke={v2.teal} strokeWidth={3} strokeOpacity={0.9} />
            <path d="M17 27 L23 33 L36 19" fill="none" stroke={v2.teal} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 12, color: v2.t2 }}>{t("loops.allClosed")}</div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="loop-rings-grid">
        {GROUPS.map(g => {
          const items = loops[g.key] ?? []
          return (
            <div key={g.key} style={{
              background: v2.bg, border: `0.5px solid ${v2.bd}`, borderRadius: 10,
              padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center",
            }}>
              <Ring count={items.length} max={6} color={g.color} />
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, color: items.length ? g.color : v2.teal }}>
                {t(g.titleKey)} · {items.length}
              </div>
              {items.length === 0 ? (
                <div style={{ fontSize: 9.5, color: v2.t3, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle size={11} /> {t("loops.closed")}
                </div>
              ) : (
                <div style={{ width: "100%", marginTop: 2 }}>
                  {items.slice(0, 3).map(item => (
                    <PreviewLink key={item.id} type={g.type} id={item.id} href={entityHref(g.type, item.id)} style={{ textDecoration: "none", display: "block" }}>
                      <div style={{
                        fontSize: 10.5, color: v2.t2, padding: "3px 0", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left",
                      }}>
                        · {item.name ?? item.title}
                      </div>
                    </PreviewLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
