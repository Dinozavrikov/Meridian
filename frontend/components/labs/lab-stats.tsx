"use client"

import { Eye, Lightbulb, Target, CheckCircle2 } from "lucide-react"
import { v2 } from "@/lib/theme"

interface LabStatsProps {
  observations: number
  hypotheses: number
  predictions: number
  results: number
  onTabChange?: (tabId: string) => void
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few
  return many
}

const ITEMS = [
  { key: "observations", tabId: "observations", icon: Eye, one: "наблюдение", few: "наблюдения", many: "наблюдений", color: "#1ABC9C" },
  { key: "predictions", tabId: "predictions", icon: Target, one: "прогноз", few: "прогноза", many: "прогнозов", color: "#3498DB" },
  { key: "results", tabId: "predictions", icon: CheckCircle2, one: "результат", few: "результата", many: "результатов", color: "#2ECC71" },
] as const

export function LabStats({ observations, hypotheses, predictions, results, onTabChange }: LabStatsProps) {
  const values = { observations, hypotheses, predictions, results }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 mt-4 border-t border-[#1E2236]">
      {ITEMS.map((item) => {
        const value = values[item.key]
        const Icon = item.icon
        const label = pluralize(value, item.one, item.few, item.many)
        const clickable = !!onTabChange

        return (
          <button
            key={item.key}
            type="button"
            disabled={!clickable}
            onClick={() => onTabChange?.(item.tabId)}
            className={`flex items-center gap-2 text-[13px] transition-all duration-150 ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            style={{ color: v2.t2 }}
          >
            <Icon size={18} style={{ color: item.color, opacity: 0.85, flexShrink: 0 }} />
            <span className="font-semibold tabular-nums" style={{ color: v2.t1 }}>{value}</span>
            <span className="opacity-70">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
