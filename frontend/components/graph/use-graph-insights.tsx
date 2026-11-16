"use client"
// Режимы графа «а что, если» и «слепые зоны»: запросы, состояние, панель. Логика цвета — в lib/graph-modes.ts.
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react"
import { useQuery } from "@tanstack/react-query"
import { graphApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { theme, typeColor } from "@/lib/theme"
import type { ForceGraphNode } from "@/components/graph/force-graph"
import {
  BLIND_RULES, COLORS, RULE_KEYS, blindOn, countByRule, indexBlindSpots, summarizeWhatIf, toggleId, whatIfColor, whatIfOn,
  type BlindSpot, type GraphMode, type WhatIfHyp,
} from "@/lib/graph-modes"

const btn = (active: boolean, color: string = theme.tx1): CSSProperties => ({
  fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${active ? color : theme.ln2}`, background: active ? `${color}24` : "transparent", color: active ? color : theme.tx3,
})
const note: CSSProperties = { fontSize: 11.5, color: theme.tx3, lineHeight: 1.4 }
const SEVERITY: Record<string, number> = { collapsed: 0, weakened: 1, strengthened: 2, unknown: 2.5, held: 3 }

export function useGraphInsights({ labId, global, knownIds }: { labId?: number; global?: boolean; knownIds?: ReadonlySet<string> } = {}) {
  const t = useT()
  const [mode, setMode] = useState<GraphMode>("normal")
  const [excluded, setExcluded] = useState<number[]>([])
  const [rule, setRule] = useState<string | null>(null)
  const exKey = useMemo(() => [...excluded].sort((a, b) => a - b), [excluded])

  const whatIfQ = useQuery({
    queryKey: ["graph", "what-if", global ? "global" : labId ?? "me", exKey],
    queryFn: () => graphApi.whatIf(exKey, labId, global),
    enabled: mode === "whatif",
  })
  const blindQ = useQuery({
    queryKey: ["graph", "blind-spots", global ? "global" : labId ?? "me"],
    queryFn: () => graphApi.blindSpots(labId, global),
    enabled: mode === "blind",
  })

  // между кликами ответ на миг пропадает: держим прошлый, чтобы цвета не мигали
  const lastHyps = useRef<WhatIfHyp[]>([])
  if (whatIfQ.data) lastHyps.current = whatIfQ.data.hypotheses
  const hyps = lastHyps.current
  const items: BlindSpot[] = useMemo(() => {
    const all: BlindSpot[] = blindQ.data?.items ?? []
    return knownIds ? all.filter(i => knownIds.has(i.node_id)) : all
  }, [blindQ.data, knownIds])

  const excludedSet = useMemo(() => new Set(excluded), [excluded])
  const wctx = useMemo(() => ({
    excluded: excludedSet,
    verdicts: new Map(hyps.map(h => [h.node_id, h.verdict as string])),
    loadBearing: new Set(hyps.flatMap(h => h.load_bearing)),
    affected: new Set(hyps.filter(h => h.affected).map(h => h.node_id)),
  }), [excludedSet, hyps])
  const spots = useMemo(() => indexBlindSpots(items), [items])
  const counts = useMemo(() => countByRule(items), [items])
  const summary = useMemo(() => summarizeWhatIf(hyps), [hyps])
  const affectedHyps = useMemo(
    () => hyps.filter(h => h.affected).sort((a, b) => SEVERITY[a.verdict] - SEVERITY[b.verdict]), [hyps])

  const colorForNode = useCallback((n: ForceGraphNode) => {
    const fallback = (typeColor as any)[n.type] ?? "#7070a0"
    if (mode === "whatif") return whatIfColor(n, wctx, fallback)
    return blindOn(n, spots, rule) ? COLORS.blind : fallback
  }, [mode, wctx, spots, rule])

  const emphasis = useCallback((n: ForceGraphNode): "on" | "off" =>
    (mode === "whatif" ? whatIfOn(n, wctx) : blindOn(n, spots, rule)) ? "on" : "off", [mode, wctx, spots, rule])

  const onNodeClick = useCallback((n: ForceGraphNode) => {
    if (mode === "whatif" && n.type === "observation") setExcluded(prev => toggleId(prev, n.entityId))
  }, [mode])

  const choose = (m: GraphMode) => { setMode(m); setRule(null); if (m !== "whatif") setExcluded([]) }
  const modes: [GraphMode, string][] = [["normal", "graphMode.normal"], ["whatif", "graphMode.whatIf"], ["blind", "graphMode.blind"]]
  const robust = excluded.length > 0 && !whatIfQ.isFetching && summary.collapsed + summary.weakened + summary.strengthened === 0

  const help = (key: string) => (
    <details style={note}><summary style={{ cursor: "pointer" }}>{t("graphMode.help")}</summary>{t(key)}</details>
  )

  const toolbar = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${theme.ln1}`, flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {modes.map(([m, key]) => <button key={m} onClick={() => choose(m)} style={btn(mode === m)}>{t(key)}</button>)}
      </div>
      {mode === "whatif" && (
        <>
          {help("graphMode.whatIf.hint")}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: theme.tx2 }}>{t("graphMode.whatIf.excluded")}: {excluded.length}</span>
            {excluded.length > 0 && <button onClick={() => setExcluded([])} style={btn(false)}>{t("graphMode.reset")}</button>}
            <span style={{ ...btn(summary.affected > 0, COLORS.affected), cursor: "default" }}>{t("graphMode.whatIf.affected")}: {summary.affected}</span>
            {(["collapsed", "weakened", "held", "strengthened"] as const).map(v => (
              <span key={v} style={{ ...btn(summary[v] > 0, v === "held" ? theme.tx2 : COLORS[v]), cursor: "default" }}>{t(`graphMode.whatIf.${v}`)}: {summary[v]}</span>
            ))}
          </div>
          {summary.loadBearing > 0 && <div style={{ ...note, color: COLORS.loadBearing }}>{t("graphMode.whatIf.loadBearing")}: {summary.loadBearing}</div>}
          {robust && <div style={note}>{t("graphMode.whatIf.robust")}</div>}
          {affectedHyps.length > 0 && (
            <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {affectedHyps.map(h => (
                <div key={h.node_id} style={{ fontSize: 12, color: h.verdict === "held" ? theme.tx2 : h.verdict === "unknown" ? COLORS.affected : COLORS[h.verdict] }}>
                  {h.full === false
                    ? `${h.name}: ${t("graphMode.whatIf.signalDelta")} ${(h.signal_delta ?? 0) > 0 ? "+" : ""}${h.signal_delta}`
                    : `${h.name}: ${t("graphMode.whatIf.level")} ${h.level_before} → ${h.level_after}, ${t("graphMode.whatIf.signal")} ${h.signal_before} → ${h.signal_after}`}
                </div>
              ))}
            </div>
          )}
          {!whatIfQ.isLoading && hyps.length === 0 && !whatIfQ.isError && <div style={note}>{t("graphMode.whatIf.empty")}</div>}
          {whatIfQ.isError && <div role="alert" style={{ ...note, color: "#E74C3C" }}>{t("graphMode.error")}</div>}
          {hyps.some(h => h.full === false) && <div style={note}>{t("graphMode.whatIf.partialNote")}</div>}
          {global && <div style={note}>{t("graphMode.whatIf.globalNote")}</div>}
          {labId != null && <div style={note}>{t("graphMode.whatIf.labNote")}</div>}
        </>
      )}
      {mode === "blind" && (
        <>
          {help("graphMode.blind.hint")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BLIND_RULES.filter(r => counts[r]).map(r => (
              <button key={r} onClick={() => setRule(rule === r ? null : r)} style={btn(rule === r, COLORS.blind)}>{t(RULE_KEYS[r])}: {counts[r]}</button>
            ))}
          </div>
          {!blindQ.isLoading && items.length === 0 && !blindQ.isError && <div style={note}>{t("graphMode.blind.empty")}</div>}
          {blindQ.isError && <div role="alert" style={{ ...note, color: "#E74C3C" }}>{t("graphMode.error")}</div>}
          {global && <div style={note}>{t("graphMode.blind.globalNote")}</div>}
          {labId != null && <div style={note}>{t("graphMode.blind.labNote")}</div>}
        </>
      )}
    </div>
  )

  return {
    toolbar,
    colorForNode: mode === "normal" ? undefined : colorForNode,
    emphasis: mode === "normal" ? undefined : emphasis,
    onNodeClick,
    previewEnabled: mode !== "whatif",
  }
}
