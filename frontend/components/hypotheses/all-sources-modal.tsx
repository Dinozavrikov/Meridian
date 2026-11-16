"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sourceGlobalApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import {
  X, ExternalLink, CheckCircle, XCircle, HelpCircle,
  Clock, ChevronDown, ChevronRight, Pencil, Trash2, Check,
} from "lucide-react"

interface Source {
  id: number; url: string; title: string; summary: string
  verdict: string; verdict_reason: string; verdict_by_user: boolean
  source_weight: number; source_type: string; weight_reason: string
  status: string; error_msg: string; created_at: string
}
interface Group { hyp_id: number; hyp_name: string; sources: Source[] }

function useVerdictCfg(): Record<string, { label: string; color: string; Icon: any }> {
  const t = useT()
  return {
    confirms: { label: t("sourcesTab.verdict.confirms"), color: "#1ABC9C", Icon: CheckCircle },
    refutes:  { label: t("sourcesTab.verdict.refutes"),  color: "#E74C3C", Icon: XCircle    },
    unclear:  { label: t("sourcesTab.verdict.unclear"),  color: "#E8A838", Icon: HelpCircle },
    pending:  { label: t("sourcesTab.verdict.pending"),  color: "#9696a2", Icon: Clock      },
  }
}
function useTypeLabels(): Record<string, string> {
  const t = useT()
  return {
    academic: t("sourcesModal.type.academic"), news: t("sourcesModal.type.news"), blog: t("sourcesModal.type.blog"),
    social: t("sourcesModal.type.social"), encyclopedia: t("sourcesModal.type.encyclopedia"), government: t("sourcesModal.type.government"),
    organization: t("sourcesModal.type.organization"), other: t("sourcesModal.type.other"), unknown: t("sourcesModal.type.unknown"),
  }
}
const TYPE_COLORS: Record<string, string> = {
  academic:"#1ABC9C", news:"#4A90D9", government:"#9B59B6",
  blog:"#E8A838", social:"#E74C3C", encyclopedia:"#4A90D9",
  organization:"#4A90D9", unknown:"#303048", other:"#303048",
}
function wc(w: number) { return w >= 8 ? "#1ABC9C" : w >= 5 ? "#4A90D9" : "#E8A838" }

function EditPanel({ src, onSave, onClose }: {
  src: Source; onSave: (v: { verdict?: string; summary?: string }) => void; onClose: () => void
}) {
  const t = useT()
  const VERDICT_CFG = useVerdictCfg()
  const [verdict, setVerdict] = useState(src.verdict)
  const [summary, setSummary] = useState(src.summary)

  return (
    <div style={{
      background: "#0a0a12", border: "1px solid #1e1e2a",
      borderRadius: 10, padding: "14px 16px", marginTop: 10,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#9999a1", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          {t("sourcesModal.verdictLabel")}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {(["confirms","refutes","unclear"] as const).map(v => {
            const cfg = VERDICT_CFG[v]
            const active = verdict === v
            return (
              <button key={v} onClick={() => setVerdict(v)} style={{
                flex: 1, padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${active ? cfg.color : "#1a1a28"}`,
                background: active ? `${cfg.color}18` : "transparent",
                color: active ? cfg.color : "#9898a4",
                fontSize: 11, fontWeight: active ? 600 : 400,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "all 0.12s",
              }}>
                <cfg.Icon size={10} /> {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#9999a1", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          {t("sourcesTab.summary")}
        </div>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={4}
          style={{
            width: "100%", background: "#06060c", border: "1px solid #14141e",
            borderRadius: 7, padding: "8px 10px", color: "#c0c0d8",
            fontSize: 12, outline: "none", resize: "vertical",
            fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box",
          }}
          onFocus={e => (e.currentTarget.style.borderColor = "#4A90D9")}
          onBlur={e  => (e.currentTarget.style.borderColor = "#14141e")}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "6px 14px", borderRadius: 7, border: "1px solid #1a1a28",
          background: "transparent", color: "#9696a2", cursor: "pointer", fontSize: 12,
        }}>{t("actions.cancel")}</button>
        <button onClick={() => onSave({ verdict, summary })} style={{
          padding: "6px 14px", borderRadius: 7, border: "none",
          background: "#4A90D9", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>
          <Check size={11} style={{ marginRight: 4, display: "inline" }} />{t("actions.save")}
        </button>
      </div>
    </div>
  )
}

function SourceRow({ src, hypId, onDeleted }: {
  src: Source; hypId: number; onDeleted: () => void
}) {
  const t = useT()
  const VERDICT_CFG = useVerdictCfg()
  const TYPE_LABELS = useTypeLabels()
  const qc = useQueryClient()
  const [open, setOpen]     = useState(false)
  const [editing, setEditing] = useState(false)

  const edit = useMutation({
    mutationFn: (body: { verdict?: string; summary?: string }) =>
      sourceGlobalApi.edit(src.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-sources"] }); setEditing(false) },
  })
  const del = useMutation({
    mutationFn: () => sourceGlobalApi.delete(src.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-sources"] }); onDeleted() },
  })

  const cfg = VERDICT_CFG[src.status === "done" ? src.verdict : "pending"] ?? VERDICT_CFG.pending
  const tc  = TYPE_COLORS[src.source_type] ?? "#303048"
  const w   = wc(src.source_weight)
  let host  = src.url
  try { host = new URL(src.url).hostname.replace("www.", "") } catch {}

  return (
    <div style={{
      background: "#0a0a12", border: `1px solid ${open ? "#1e1e2a" : "#0f0f18"}`,
      borderRadius: 9, overflow: "hidden", transition: "border-color 0.12s",
    }}>
      <div onClick={() => { setOpen(o => !o); setEditing(false) }}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>

        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${w}14`, border: `1px solid ${w}28`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: w, fontFamily: "monospace",
        }}>
          {src.status === "done" ? src.source_weight : "…"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: "#a0a0b8",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3,
          }}>{src.title || host}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 3,
              background: `${tc}12`, color: tc, border: `1px solid ${tc}22`,
            }}>{TYPE_LABELS[src.source_type] ?? t("sourcesModal.type.other")}</span>
            <cfg.Icon size={9} style={{ color: cfg.color }} />
            <span style={{ fontSize: 10, color: cfg.color }}>{cfg.label}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <a href={src.url} target="_blank" rel="noopener noreferrer"
            style={{ padding: "4px 6px", color: "#96969d", display: "flex",
              borderRadius: 5, textDecoration: "none", transition: "color 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#4A90D9")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9a9aa1")}>
            <ExternalLink size={11} />
          </a>
          <button onClick={() => { setOpen(true); setEditing(e => !e) }}
            style={{ padding: "4px 6px", border: "none", background: "transparent",
              color: editing ? "#4A90D9" : "#9a9aa1", cursor: "pointer", borderRadius: 5,
              transition: "color 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#4A90D9")}
            onMouseLeave={e => (e.currentTarget.style.color = editing ? "#4A90D9" : "#1e1e2e")}>
            <Pencil size={11} />
          </button>
          <button onClick={async () => { if (await askConfirmText(t("sourcesTab.confirmDelete"))) del.mutate() }}
            style={{ padding: "4px 6px", border: "none", background: "transparent",
              color: "#96969d", cursor: "pointer", borderRadius: 5, transition: "color 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9a9aa1")}>
            <Trash2 size={11} />
          </button>
          <span style={{ color: "#96969d", display: "flex", alignItems: "center", paddingLeft: 2 }}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid #0d0d18", padding: "10px 12px 12px" }}>
          <div style={{ fontSize: 10, color: "#1a1a28", fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8 }}>
            {src.url}
          </div>

          {!editing ? (
            <>
              {src.summary && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: "#9999a1", textTransform: "uppercase",
                    letterSpacing: "0.07em", marginBottom: 5 }}>{t("sourcesTab.summary")}</div>
                  <p style={{ fontSize: 12, color: "#95959f", lineHeight: 1.7, margin: 0 }}>{src.summary}</p>
                </div>
              )}
              {src.verdict_reason && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: "#9999a1", textTransform: "uppercase",
                    letterSpacing: "0.07em", marginBottom: 5 }}>{t("sourcesTab.reasoning")}</div>
                  <p style={{ fontSize: 11, color: "#96969e", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                    {src.verdict_reason}
                  </p>
                </div>
              )}
              {src.weight_reason && (
                <div>
                  <div style={{ fontSize: 9, color: "#9999a1", textTransform: "uppercase",
                    letterSpacing: "0.07em", marginBottom: 5 }}>{t("sourcesModal.reliability")}</div>
                  <p style={{ fontSize: 11, color: "#96969e", lineHeight: 1.6, margin: 0 }}>{src.weight_reason}</p>
                </div>
              )}
              {src.status === "error" && src.error_msg && (
                <div style={{ background: "#140808", border: "1px solid #281010",
                  borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#a68080", marginTop: 8 }}>
                  {src.error_msg}
                </div>
              )}
              {src.verdict_by_user && (
                <div style={{ fontSize: 10, color: "#96969d", marginTop: 8, textAlign: "right" }}>
                  {t("sourcesTab.manualVerdict")}
                </div>
              )}
            </>
          ) : (
            <EditPanel
              src={src}
              onSave={body => edit.mutate(body)}
              onClose={() => setEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function HypGroup({ group }: { group: Group }) {
  const t = useT()
  const [open, setOpen] = useState(true)
  const qc = useQueryClient()

  const conf = group.sources.filter(s => s.verdict === "confirms" && s.status === "done").length
  const ref  = group.sources.filter(s => s.verdict === "refutes"  && s.status === "done").length

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        border: "none", cursor: "pointer",
        padding: "10px 14px", borderRadius: 8, marginBottom: open ? 8 : 0,
        background: "#0d0d16", transition: "background 0.12s",
        textAlign: "left",
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#111120"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#0d0d16"}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#b0b0c8", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.hyp_name}
        </span>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#9999a1" }}>{group.sources.length} {t("sourcesModal.sourcesShort")}</span>
          {conf > 0 && <span style={{ fontSize: 10, color: "#1ABC9C" }}>✓{conf}</span>}
          {ref  > 0 && <span style={{ fontSize: 10, color: "#E74C3C" }}>✗{ref}</span>}
          <span style={{ color: "#96969d" }}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        </div>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
          {group.sources.map(src => (
            <SourceRow
              key={src.id}
              src={src}
              hypId={group.hyp_id}
              onDeleted={() => qc.invalidateQueries({ queryKey: ["all-sources"] })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function AllSourcesModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [search, setSearch] = useState("")

  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ["all-sources"],
    queryFn:  sourceGlobalApi.listAll,
  })

  const filtered = search.trim()
    ? groups.map(g => ({
        ...g,
        sources: g.sources.filter(s =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.url.toLowerCase().includes(search.toLowerCase()) ||
          s.summary.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.sources.length > 0 ||
        g.hyp_name.toLowerCase().includes(search.toLowerCase()))
    : groups

  const totalSrc = groups.reduce((s, g) => s + g.sources.length, 0)
  const conf     = groups.reduce((s, g) => s + g.sources.filter(x => x.verdict === "confirms" && x.status === "done").length, 0)
  const ref      = groups.reduce((s, g) => s + g.sources.filter(x => x.verdict === "refutes"  && x.status === "done").length, 0)

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, height: "100vh", background: "#09090f",
        borderLeft: "1px solid #1a1a28",
        display: "flex", flexDirection: "column",
        animation: "slideIn 0.2s ease",
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(40px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        `}</style>

        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #141420",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#c0c0d8", marginBottom: 4 }}>
              {t("sourcesModal.title")}
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ fontSize: 11, color: "#9999a1" }}>{totalSrc} {t("sourcesModal.sourcesFull")}</span>
              {conf > 0 && <span style={{ fontSize: 11, color: "#1ABC9C" }}>✓ {conf} {t("sourcesModal.confirmedAbbr")}</span>}
              {ref  > 0 && <span style={{ fontSize: 11, color: "#E74C3C" }}>✗ {ref} {t("sourcesModal.refutedAbbr")}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: "6px", border: "none", background: "transparent",
            color: "#9696a2", cursor: "pointer", borderRadius: 6, display: "flex",
            transition: "color 0.12s",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "#c0c0d8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9898a4")}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "10px 20px", borderBottom: "1px solid #0f0f18", flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("sourcesModal.searchPlaceholder")}
            style={{
              width: "100%", background: "#06060c", border: "1px solid #14141e",
              borderRadius: 7, padding: "7px 12px", color: "#c0c0d8",
              fontSize: 12, outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "#4A90D9")}
            onBlur={e  => (e.currentTarget.style.borderColor = "#14141e")}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9999a1" }}>{t("sourcesTab.loading")}</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
              <p style={{ color: "#9999a1", fontSize: 13 }}>
                {search ? t("sourcesModal.notFound") : t("sourcesTab.empty.title")}
              </p>
            </div>
          ) : filtered.map(g => (
            <HypGroup key={g.hyp_id} group={g} />
          ))}
        </div>
      </div>
    </div>
  )
}
