"use client"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import axios from "axios"
import { useT } from "@/lib/i18n/useT"
import { pluralKey } from "@/lib/i18n/ru-plural"
import { v2 } from "@/lib/theme"
import { fmtNumber, maturityModelApi, type MaturityModel, type SimInput, type SimObservation, type SimPrediction, type SimResult } from "@/lib/maturity-model"
import { useDocs } from "./docs-context"
import { useMaturityLevels } from "./use-maturity-levels"
import { body, card, eyebrow, h3 } from "./docs-style"

const OUTCOME_COLOR: Record<string, string> = { confirmed: v2.teal, partial: v2.amber, refuted: v2.red }
const field = { padding: "6px 10px", fontSize: 13, color: v2.t1, background: v2.bg, border: `1px solid ${v2.bd2}`, borderRadius: 8 } as const
const removeBtn = { ...field, cursor: "pointer", flex: "none", whiteSpace: "nowrap" } as const
const row = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, padding: "14px 16px", borderRadius: 12, background: v2.bg, border: `1px solid ${v2.bd}` } as const

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {options.map(o => {
        const on = o.v === value
        const c = o.color ?? v2.teal
        return (
          <button key={String(o.v)} type="button" className="docs-btn" aria-pressed={on} onClick={() => onChange(o.v)}
            style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12.5, color: on ? v2.t1 : v2.t3, border: `1px solid ${on ? c : v2.bd2}`, background: on ? `color-mix(in srgb, ${c} 16%, transparent)` : "transparent" }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function initialInput(m: MaturityModel): SimInput {
  const ex = m.prediction.examples
  return {
    risk: Math.round((m.risk.min + m.risk.max) / 2),
    predictions: [ex[Math.floor(ex.length / 2)], ex[ex.length - 1]].map(e => ({ confidence: e.confidence, outcome: m.outcomes[0], confirms_if_true: true })),
    observations: [{ sign: 1, importance: Math.round(m.observation.importance_max / 2) }],
    lab_signal: 0, history_hits: 0, history_misses: 0, history_confidence: m.prediction.default_confidence,
  }
}

export function DocsCalculator() {
  const t = useT()
  const { model, failed, retry } = useDocs()
  if (!model) {
    return (
      <div style={{ ...card, color: v2.t3 }}>
        {failed ? <>{t("docsPage.calc.error")} <button type="button" className="docs-btn" onClick={retry} style={{ ...field, marginLeft: 8, cursor: "pointer" }}>{t("docsPage.calc.retry")}</button></> : t("docsPage.calc.loading")}
      </div>
    )
  }
  return <Body model={model} />
}

function Body({ model }: { model: MaturityModel }) {
  const t = useT()
  const { locale } = useDocs()
  const lv = useMaturityLevels()
  const [input, setInput] = useState<SimInput>(() => initialInput(model))
  const [res, setRes] = useState<SimResult | null>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [attempt, setAttempt] = useState(0)
  const f = (n: number, digits = 2) => fmtNumber(n, locale, digits)
  const signed = (n: number) => (n > 0 ? "+" : "") + f(n)
  const maxItems = model.limits.max_items
  const importanceSteps = useMemo(() => Array.from({ length: Math.floor(model.observation.importance_max) + 1 }, (_, i) => i), [model])

  useEffect(() => {
    const ctl = new AbortController()
    setStatus("loading")
    const timer = setTimeout(() => {
      maturityModelApi.simulate(input, ctl.signal)
        .then(r => { setRes(r); setStatus("ok") })
        .catch(e => { if (!axios.isCancel(e)) setStatus("error") })
    }, 250)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [input, attempt])

  const setPred = (i: number, p: Partial<SimPrediction>) => setInput(s => ({ ...s, predictions: s.predictions.map((x, j) => (j === i ? { ...x, ...p } : x)) }))
  const setObs = (i: number, p: Partial<SimObservation>) => setInput(s => ({ ...s, observations: s.observations.map((x, j) => (j === i ? { ...x, ...p } : x)) }))
  const addPred = () => setInput(s => ({ ...s, predictions: [...s.predictions, { confidence: model.prediction.default_confidence, outcome: model.outcomes[0], confirms_if_true: true }] }))
  const addObs = () => setInput(s => ({ ...s, observations: [...s.observations, { sign: 1, importance: Math.round(model.observation.importance_max / 2) }] }))
  const num = (v: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)))
  const heading = (text: string, count: ReactNode) => <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "2px 12px", marginBottom: 10 }}><h4 style={{ ...h3, margin: 0, fontSize: 15 }}>{text}</h4><span style={{ fontSize: 12, color: v2.t4, whiteSpace: "nowrap" }}>{count}</span></div>
  const addBtn = (label: string, on: () => void, full: boolean) => (
    <button type="button" className="docs-btn" onClick={on} disabled={full} style={{ ...field, cursor: full ? "not-allowed" : "pointer", opacity: full ? 0.5 : 1 }}>{full ? t("docsPage.calc.full") : `+ ${label}`}</button>
  )

  const level = res?.level ?? 0
  const lo = res ? res.thresholds[res.level] : 0
  const hi = res && res.next_level != null ? res.thresholds[res.next_level] : null
  const pct = !res ? 0 : hi == null ? 100 : Math.max(0, Math.min(100, ((res.signal.total - lo) / (hi - lo)) * 100))

  return (
    <div className="docs-calc" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ ...card, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, minWidth: 0 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: v2.t2 }}><span>{t("docsPage.calc.risk")}</span><b>{input.risk}</b></span>
          <input className="docs-range" type="range" min={model.risk.min} max={model.risk.max} value={input.risk} onChange={e => setInput(s => ({ ...s, risk: Number(e.target.value) }))} />
        </label>

        <div>
          {heading(t("docsPage.calc.predictions"), t(pluralKey("docsPage.calc.predictionCount", input.predictions.length), { n: input.predictions.length }))}
          <div style={{ display: "grid", gap: 10 }}>
            {input.predictions.map((p, i) => (
              <div key={i} style={row}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <Seg value={p.outcome} label={t("docsPage.calc.predictions")} onChange={v => setPred(i, { outcome: v })}
                    options={model.outcomes.map(o => ({ v: o, label: t(`docsPage.calc.outcome.${o}`), color: OUTCOME_COLOR[o] }))} />
                  <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: v2.t2 }}>{res?.predictions[i] ? signed(res.predictions[i].contribution) : ""}</span>
                </div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: v2.t3 }}><span>{t("docsPage.calc.confidence")}</span><span>{p.confidence}%</span></span>
                  <input className="docs-range" type="range" min={0} max={100} value={p.confidence ?? model.prediction.default_confidence} onChange={e => setPred(i, { confidence: Number(e.target.value) })} />
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <label style={{ display: "flex", flex: "1 1 170px", minWidth: 0, gap: 8, alignItems: "center", fontSize: 12.5, color: v2.t3 }}>
                    <input type="checkbox" style={{ flex: "none", width: 16, height: 16, margin: 0 }} checked={!p.confirms_if_true} onChange={e => setPred(i, { confirms_if_true: !e.target.checked })} />{t("docsPage.calc.stress")}
                  </label>
                  <button type="button" className="docs-btn" onClick={() => setInput(s => ({ ...s, predictions: s.predictions.filter((_, j) => j !== i) }))} style={removeBtn}>{t("docsPage.calc.remove")}</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>{addBtn(t("docsPage.calc.addPrediction"), addPred, input.predictions.length >= maxItems)}</div>
        </div>

        <div>
          {heading(t("docsPage.calc.observations"), t(pluralKey("docsPage.calc.observationCount", input.observations.length), { n: input.observations.length }))}
          <div style={{ display: "grid", gap: 10 }}>
            {input.observations.map((o, i) => (
              <div key={i} style={{ ...row, display: "flex", flexWrap: "wrap", alignItems: "center" }}>
                <Seg value={o.sign} label={t("docsPage.calc.observations")} onChange={v => setObs(i, { sign: v })}
                  options={[{ v: 1 as const, label: t("docsPage.calc.sign.plus"), color: v2.teal }, { v: -1 as const, label: t("docsPage.calc.sign.minus"), color: v2.red }]} />
                <select aria-label={t("docsPage.calc.importance")} value={o.importance ?? ""} onChange={e => setObs(i, { importance: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...field, flex: "1 1 120px", minWidth: 0 }}>
                  <option value="">{t("docsPage.calc.importanceNone")}</option>
                  {importanceSteps.map(n => <option key={n} value={n}>{t("docsPage.calc.importance")}: {n}</option>)}
                </select>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: v2.t2 }}>{res?.observations[i] ? signed(res.observations[i].contribution) : ""}</span>
                <button type="button" className="docs-btn" onClick={() => setInput(s => ({ ...s, observations: s.observations.filter((_, j) => j !== i) }))} style={removeBtn}>{t("docsPage.calc.remove")}</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>{addBtn(t("docsPage.calc.addObservation"), addObs, input.observations.length >= maxItems)}</div>
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: v2.t2 }}>{t("docsPage.calc.lab")}</span>
          <input type="number" step="0.1" min={-model.limits.lab_signal} max={model.limits.lab_signal} value={input.lab_signal}
            onChange={e => setInput(s => ({ ...s, lab_signal: Math.max(-model.limits.lab_signal, Math.min(model.limits.lab_signal, Number(e.target.value) || 0)) }))} style={field} />
          <span style={{ fontSize: 12, color: v2.t4 }}>{t("docsPage.calc.labHint")}</span>
        </label>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: v2.t2 }}>{t("docsPage.calc.history")}</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <p style={{ ...body, fontSize: 12.5 }}>{t("docsPage.calc.historyHint")}</p>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: v2.t3 }}>{t("docsPage.calc.hits")}
              <input type="number" min={0} max={model.limits.max_history} value={input.history_hits} onChange={e => setInput(s => ({ ...s, history_hits: num(e.target.value, model.limits.max_history) }))} style={field} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: v2.t3 }}>{t("docsPage.calc.misses")}
              <input type="number" min={0} max={model.limits.max_history} value={input.history_misses} onChange={e => setInput(s => ({ ...s, history_misses: num(e.target.value, model.limits.max_history) }))} style={field} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: v2.t3 }}>{t("docsPage.calc.historyConfidence")}: {input.history_confidence}%
              <input className="docs-range" type="range" min={0} max={100} value={input.history_confidence} onChange={e => setInput(s => ({ ...s, history_confidence: Number(e.target.value) }))} /></label>
          </div>
        </details>
        <button type="button" className="docs-btn" onClick={() => setInput(initialInput(model))} style={{ ...field, justifySelf: "start", cursor: "pointer" }}>{t("docsPage.calc.reset")}</button>
      </div>

      <div style={{ ...card, minWidth: 0, position: "sticky", top: 72, opacity: status === "loading" && res ? 0.6 : 1, transition: "opacity .15s" }} aria-live="polite">
        {status === "error" ? (
          <p style={body}>{t("docsPage.calc.error")} <button type="button" className="docs-btn" onClick={() => setAttempt(a => a + 1)} style={{ ...field, marginLeft: 8, cursor: "pointer" }}>{t("docsPage.calc.retry")}</button></p>
        ) : !res ? <p style={body}>{t("docsPage.calc.loading")}</p> : (
          <>
            {input.predictions.length + input.observations.length === 0 && <p style={{ ...body, marginBottom: 12 }}>{t("docsPage.calc.empty")}</p>}
            <div style={eyebrow}>{t("docsPage.calc.level")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
              <span data-testid="docs-calc-level" style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, color: v2.teal }}>{level}</span>
              <span style={{ fontSize: 18, color: v2.t1 }}>{lv.label(level)}</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ height: 8, borderRadius: 4, background: v2.bd, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: v2.teal, transition: "width .25s" }} />
            </div>
            <p style={{ ...body, marginBottom: 18 }}>{res.next_level == null ? t("docsPage.calc.top") : t("docsPage.calc.toNext", { level: lv.label(res.next_level), n: f(res.to_next ?? 0) })}</p>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", margin: "0 0 18px", fontSize: 14, color: v2.t2 }}>
              <dt>{t("docsPage.calc.partPredictions")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{signed(res.signal.predictions)}</dd>
              <dt>{t("docsPage.calc.partObservations")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{signed(res.signal.observations)}</dd>
              <dt>{t("docsPage.calc.partLab")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{signed(res.signal.lab)}</dd>
              <dt style={{ color: v2.t1, fontWeight: 600 }}>{t("docsPage.calc.signal")}</dt><dd style={{ margin: 0, textAlign: "right", color: v2.t1, fontWeight: 600 }}>{f(res.signal.total)}</dd>
              <dt>{t("docsPage.calc.skill")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{f(res.skill_multiplier)}</dd>
              <dt>{t("docsPage.calc.riskMultiplier")}</dt><dd style={{ margin: 0, textAlign: "right" }}>{f(res.risk_multiplier)}</dd>
            </dl>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4, fontSize: 13 }}>
              {res.thresholds.map((th, i) => (
                <li key={i} aria-current={i === res.level} style={{ display: "flex", justifyContent: "space-between", color: i === res.level ? v2.t1 : v2.t4 }}>
                  <span>{i} · {lv.label(i)}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>≥ {f(th)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p style={{ ...body, marginTop: 16, fontSize: 12.5, color: v2.t4 }}>{t("docsPage.calc.note")}</p>
      </div>
    </div>
  )
}
