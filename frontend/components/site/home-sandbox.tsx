"use client"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"
import { SECTION_KEYS } from "@/lib/site/home"
import { GAP_IDS, SANDBOX_ID, SANDBOX_KEYS as K, buildMarkdown, edgeOf, exportFileName, gapExampleKey, gapKeys, missingGaps, type SandboxDraft } from "@/lib/site/sandbox"
import { downloadText } from "@/lib/site/download-text"
import { HomeSection, cardStyle, h3Style, pStyle } from "@/components/site/home-section"
import { useConfidenceBounds } from "@/components/site/use-confidence-bounds"
import { HomeExample } from "@/components/site/home-example"

const field = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${v2.bd2}`,
  background: "rgba(255,255,255,0.04)", color: v2.t1, fontSize: 15, lineHeight: 1.5, fontFamily: "inherit", minWidth: 0,
} as const
const labelStyle = { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: v2.t2 } as const
const small = { margin: 0, fontSize: 12, lineHeight: 1.5, color: v2.t3 } as const

type Status = "" | "copied" | "copyFailed"

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/** Песочница «проверь свою идею»: все считается в браузере, ничего не отправляется и не сохраняется. */
export function HomeSandbox() {
  const t = useT()
  const uid = useId()
  const ids = { claim: `${uid}-claim`, confidence: `${uid}-confidence`, source: `${uid}-source`, refutation: `${uid}-refutation`, deadline: `${uid}-deadline` }
  const bounds = useConfidenceBounds()
  const [claim, setClaim] = useState("")
  const [confidence, setConfidence] = useState<number | null>(null)
  const [source, setSource] = useState("")
  const [refutation, setRefutation] = useState("")
  const [deadline, setDeadline] = useState("")
  const [status, setStatus] = useState<Status>("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const draft: SandboxDraft = { claim, confidence, source, refutation, deadline }
  const missing = missingGaps(draft)
  const done = GAP_IDS.length - missing.length
  const hasClaim = claim.trim().length > 0
  const edge = edgeOf(confidence, bounds)
  const hint = !bounds ? "" : confidence === null ? t(K.confidenceHelp) : edge === "low" ? t(K.edgeLow) : edge === "high" ? t(K.edgeHigh) : ""

  const onDownload = () => {
    if (!hasClaim) return
    const now = new Date()
    downloadText(exportFileName(now), buildMarkdown(draft, t, now))
  }
  const onCopy = async () => {
    if (!hasClaim) return
    const text = buildMarkdown(draft, t, new Date())
    try {
      await navigator.clipboard.writeText(text)
      setStatus("copied")
    } catch {
      setStatus("copyFailed")
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(""), 2500)
  }
  // Not the native disabled: the button must stay focusable, so that a keyboard or screen reader user reaches the reason.
  const reasonId = `${uid}-reason`
  const blocked = hasClaim ? {} : ({ "aria-disabled": true, "aria-describedby": reasonId } as const)
  const btn = { cursor: hasClaim ? "pointer" : "not-allowed", opacity: hasClaim ? 1 : 0.45, fontFamily: "inherit" } as const

  return (
    <HomeSection id={SANDBOX_ID} title={t(SECTION_KEYS.sandbox.title)} lead={t(SECTION_KEYS.sandbox.lead)}>
      <div style={{ display: "grid", gap: 20, alignItems: "start", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <div style={{ ...cardStyle, display: "grid", gap: 18 }}>
          <Field id={ids.claim} label={t(K.claimLabel)}>
            <textarea id={ids.claim} rows={3} value={claim} onChange={e => setClaim(e.target.value)} placeholder={t(K.claimPlaceholder)} style={{ ...field, resize: "vertical" }} />
          </Field>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <label htmlFor={ids.confidence} style={{ ...labelStyle, marginBottom: 0 }}>{t(K.confidenceLabel)}</label>
              <span style={{ fontSize: 13, fontWeight: 600, color: confidence === null ? v2.t3 : v2.teal }}>
                {confidence === null ? t(K.confidenceIdle) : t(K.confidenceValue, { pct: confidence })}
              </span>
            </div>
            <input id={ids.confidence} type="range" min={bounds?.min} max={bounds?.max} step={1} value={confidence ?? bounds?.initial ?? 0} disabled={!bounds} onChange={e => setConfidence(Number(e.target.value))} style={{ width: "100%", accentColor: v2.teal }} />
            {hint && <p style={{ ...small, marginTop: 6, color: edge ? v2.amber : v2.t3 }}>{hint}</p>}
          </div>
          <Field id={ids.source} label={t(K.sourceLabel)}>
            <textarea id={ids.source} rows={2} value={source} onChange={e => setSource(e.target.value)} placeholder={t(K.sourcePlaceholder)} style={{ ...field, resize: "vertical" }} />
          </Field>
          <Field id={ids.refutation} label={t(K.refutationLabel)}>
            <textarea id={ids.refutation} rows={2} value={refutation} onChange={e => setRefutation(e.target.value)} placeholder={t(K.refutationPlaceholder)} style={{ ...field, resize: "vertical" }} />
          </Field>
          <Field id={ids.deadline} label={t(K.deadlineLabel)}>
            <input id={ids.deadline} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...field, colorScheme: "dark" }} />
          </Field>
          <p style={small}>{t(K.privacy)}</p>
        </div>
        <div style={{ ...cardStyle, display: "grid", gap: 14, alignContent: "start" }}>
          <h3 style={{ ...h3Style, margin: 0 }}>{t(K.resultTitle)}</h3>
          <div>
            <p role="status" style={{ ...small, margin: "0 0 8px" }}>{t(K.progress, { done, total: GAP_IDS.length })}</p>
            <div style={{ display: "flex", gap: 5 }}>
              {GAP_IDS.map((id, i) => <span key={id} style={{ flex: 1, height: 8, borderRadius: 4, background: i < done ? v2.teal : "rgba(255,255,255,0.08)" }} />)}
            </div>
          </div>
          {missing.length === 0 ? (
            <p style={pStyle}>{t(K.allFilled)}</p>
          ) : (
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: v2.t1 }}>{t(K.gapsTitle)}</h4>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
                {missing.map(id => {
                  const g = gapKeys(id)
                  return (
                    <li key={id} style={{ fontSize: 13, lineHeight: 1.55 }}>
                      <div style={{ fontWeight: 600, color: v2.amber }}>{t(g.label)}</div>
                      <div style={{ color: v2.t2, overflowWrap: "anywhere" }}>{t(g.question)}</div>
                      <div style={{ color: v2.t3, overflowWrap: "anywhere" }}>{t(g.note)}</div>
                      <HomeExample k={gapExampleKey(id)} />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p style={small}>{t(K.explain)}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 14, borderTop: `1px solid ${v2.bd}` }}>
            <button type="button" className="feat-cta feat-cta--primary" {...blocked} onClick={onDownload} style={btn}>{t(K.download)}</button>
            <button type="button" className="feat-cta" {...blocked} onClick={onCopy} style={{ ...btn, background: "transparent" }}>{t(K.copy)}</button>
          </div>
          {!hasClaim && <p id={reasonId} style={{ ...small, color: v2.amber }}>{t(K.claimFirst)}</p>}
          {status && <p role="status" style={{ ...small, color: status === "copied" ? v2.teal : v2.amber }}>{status === "copied" ? t(K.copied) : t(K.copyFailed)}</p>}
        </div>
      </div>
    </HomeSection>
  )
}
