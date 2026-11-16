"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sourceApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { useListContentTranslation } from "@/lib/i18n/useContentT"
import {
  ExternalLink, Trash2, Plus, RefreshCw,
  CheckCircle, XCircle, HelpCircle, Clock, AlertCircle, ChevronDown, ChevronRight,
} from "lucide-react"

interface Source {
  id:             number
  entity_type:    string
  entity_id:      number
  url:            string
  title:          string
  summary:        string
  verdict_reason: string
  source_weight:  number
  source_type:    string
  verdict:        string
  verdict_by_user:boolean
  status:         string
  error_msg:      string
  weight_reason:  string
  created_at:     string
}

function useTypeLabels(): Record<string, string> {
  const t = useT()
  return {
    academic:     t("sourcesTab.type.academic"),
    news:         t("sourcesTab.type.news"),
    blog:         t("sourcesTab.type.blog"),
    social:       t("sourcesTab.type.social"),
    encyclopedia: t("sourcesTab.type.encyclopedia"),
    government:   t("sourcesTab.type.government"),
    organization: t("sourcesTab.type.organization"),
    unknown:      t("sourcesTab.type.unknown"),
  }
}

const TYPE_COLORS: Record<string, string> = {
  academic:     "#1ABC9C",
  news:         "#4A90D9",
  government:   "#9B59B6",
  blog:         "#E8A838",
  social:       "#E74C3C",
  encyclopedia: "#4A90D9",
  organization: "#4A90D9",
  unknown:      "#404050",
}

function weightColor(w: number): string {
  if (w >= 9) return "#1ABC9C"
  if (w >= 7) return "#4A90D9"
  if (w >= 4) return "#E8A838"
  return "#E74C3C"
}

function WeightBar({ weight }: { weight: number }) {
  const c = weightColor(weight)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ width: 10, height: 3, borderRadius: 2, background: i < weight ? c : "#1c1c28", transition: "background 0.2s" }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: c, fontFamily: "monospace", fontWeight: 600 }}>{weight}/10</span>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const t = useT()
  const map: Record<string, { label: string; color: string; Icon: any }> = {
    confirms: { label: t("sourcesTab.verdict.confirms"), color: "#1ABC9C", Icon: CheckCircle },
    refutes:  { label: t("sourcesTab.verdict.refutes"),  color: "#E74C3C", Icon: XCircle    },
    unclear:  { label: t("sourcesTab.verdict.unclear"),  color: "#E8A838", Icon: HelpCircle },
    pending:  { label: t("sourcesTab.verdict.pending"),  color: "#96969e", Icon: Clock      },
  }
  const cfg = map[verdict] ?? map.unclear
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: cfg.color }}>
      <cfg.Icon size={10} /> {cfg.label}
    </span>
  )
}

function SourceCard({ src, onSetVerdict, onDelete, canEdit = true, tSrc }: {
  src: Source
  onSetVerdict: (v: string) => void
  onDelete: () => void
  canEdit?: boolean
  tSrc: (field: keyof Source, fallback: string) => string
}) {
  const t = useT()
  const TYPE_LABELS = useTypeLabels()
  const [open, setOpen] = useState(false)
  const tc   = TYPE_COLORS[src.source_type] ?? "#404050"
  const wc   = weightColor(src.source_weight)
  const busy = src.status === "pending" || src.status === "processing"

  let hostname = src.url
  try { hostname = new URL(src.url).hostname.replace("www.", "") } catch {}

  return (
    <div style={{
      background: "#08080f",
      border: `1px solid ${open ? "#22223a" : "#13131e"}`,
      borderRadius: 10,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        padding: "11px 14px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `${wc}12`, border: `1px solid ${wc}28`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: wc, fontFamily: "monospace",
        }}>
          {busy ? "…" : src.source_weight}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: "#b0b0c8",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4,
          }}>
            {tSrc("title", src.title) || hostname}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 12, padding: "1px 7px", borderRadius: 4,
              background: `${tc}12`, color: tc, border: `1px solid ${tc}22`,
            }}>
              {TYPE_LABELS[src.source_type] ?? t("sourcesTab.type.unknown")}
            </span>
            {busy ? (
              <span style={{ fontSize: 12, color: "#9696a2", fontStyle: "italic",
                animation: "mpulse 1.5s ease-in-out infinite" }}>
                {src.status === "processing" ? t("sourcesTab.analyzing") : t("sourcesTab.queued")}
              </span>
            ) : src.status === "error" ? (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#E74C3C" }}>
                <AlertCircle size={10} /> {t("sourcesTab.error")}
              </span>
            ) : (
              <VerdictBadge verdict={src.verdict} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 2, flexShrink: 0, alignItems: "center" }}>
          <a href={src.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ padding: "4px 6px", color: "#9999a1", display: "flex", borderRadius: 5,
              textDecoration: "none", transition: "color 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#4A90D9")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9d9da4")}>
            <ExternalLink size={11} />
          </a>
          {canEdit && (
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ padding: "4px 6px", border: "none", background: "transparent",
                color: "#9999a1", cursor: "pointer", borderRadius: 5, display: "flex",
                transition: "color 0.12s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9d9da4")}>
              <Trash2 size={11} />
            </button>
          )}
          <div style={{ color: "#9999a1", display: "flex", paddingLeft: 2 }}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid #12121e", padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ fontSize: 12, color: "#9999a1", fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {src.url}
          </div>

          {!busy && src.status !== "error" && <WeightBar weight={src.source_weight} />}

          {src.summary && (
            <div>
              <div style={{ fontSize: 12, color: "#9696a2", textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 6 }}>{t("sourcesTab.summary")}</div>
              <p style={{ fontSize: 12, color: "#9898a8", lineHeight: 1.75, margin: 0 }}>
                {tSrc("summary", src.summary)}
              </p>
            </div>
          )}

          {src.verdict_reason && (
            <div>
              <div style={{ fontSize: 12, color: "#9696a2", textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 5 }}>{t("sourcesTab.reasoning")}</div>
              <p style={{ fontSize: 12, color: "#888898", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
                {tSrc("verdict_reason", src.verdict_reason)}
              </p>
            </div>
          )}

          {src.weight_reason && (
            <div>
              <div style={{ fontSize: 12, color: "#9696a2", textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 5 }}>{t("sourcesTab.weightReason")}</div>
              <p style={{ fontSize: 12, color: "#888898", lineHeight: 1.65, margin: 0 }}>
                {tSrc("weight_reason", src.weight_reason)}
              </p>
            </div>
          )}

          {src.status === "error" && src.error_msg && (
            <div style={{ background: "#140808", border: "1px solid #281010",
              borderRadius: 7, padding: "9px 11px", fontSize: 12, color: "#a68080" }}>
              {src.error_msg}
            </div>
          )}

          {src.verdict === "unclear" && !busy && (
            <div style={{ background: "#100e04", border: "1px solid #28220a",
              borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ fontSize: 12, color: "#af9875", marginBottom: 9 }}>
                {t("sourcesTab.unclearNotice")}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                {([
                  { v: "confirms", label: t("sourcesTab.confirmBtn"), c: "#1ABC9C" },
                  { v: "refutes",  label: t("sourcesTab.refuteBtn"),  c: "#E74C3C" },
                ] as const).map(({ v, label, c }) => (
                  <button key={v} onClick={() => onSetVerdict(v)} style={{
                    flex: 1, padding: "7px 10px", borderRadius: 7,
                    border: `1px solid ${c}28`, background: `${c}0e`,
                    color: c, fontSize: 12, cursor: "pointer", fontWeight: 500,
                    transition: "background 0.12s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${c}1e`)}
                    onMouseLeave={e => (e.currentTarget.style.background = `${c}0e`)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {src.verdict_by_user && src.verdict !== "unclear" && (
            <div style={{ fontSize: 12, color: "#9999a1", textAlign: "right" }}>
              {t("sourcesTab.manualVerdict")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SourcesTab({
  entityType,
  entityId,
  entityName,
  canEdit = true,
}: {
  entityType: string
  entityId: number
  entityName: string
  canEdit?: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const [url, setUrl] = useState("")
  const qkey = ["sources", entityType, entityId]

  const { data: sources = [], isLoading } = useQuery<Source[]>({
    queryKey: qkey,
    queryFn:  () => sourceApi.list(entityType, entityId),
    refetchInterval: (query) => {
      const d = query.state.data as Source[] | undefined
      return d?.some(s => s.status === "pending" || s.status === "processing") ? 2500 : false
    },
  })

  // SourceDocument.user_id всегда равен владельцу СУЩНОСТИ (add_source
  // требует быть владельцем entity — см. backend/app/api/v1/sources.py),
  // поэтому весь список источников одной сущности либо целиком "свой",
  // либо целиком "чужой" — canEdit (уже = isOwner(user, entity) на
  // вызывающих страницах) достаточно, не нужен отдельный is_own с бэкенда.
  const tSources = useListContentTranslation(
    "source_document", sources, ["title", "summary", "verdict_reason", "weight_reason"],
    () => canEdit,
  )

  const add = useMutation({
    mutationFn: (u: string) => sourceApi.add(entityType, entityId, u),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: qkey }); setUrl("") },
  })
  const setVerdict = useMutation({
    mutationFn: ({ docId, verdict }: { docId: number; verdict: string }) =>
      sourceApi.setVerdict(entityType, entityId, docId, verdict),
    onSuccess: () => qc.invalidateQueries({ queryKey: qkey }),
  })
  const remove = useMutation({
    mutationFn: (docId: number) => sourceApi.delete(entityType, entityId, docId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: qkey }),
  })

  const handleAdd = () => {
    const u = url.trim()
    if (!u || !/^https?:\/\//i.test(u)) return
    add.mutate(u)
  }

  const confirms = sources.filter(s => s.verdict === "confirms" && s.status === "done").length
  const refutes  = sources.filter(s => s.verdict === "refutes"  && s.status === "done").length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes mpulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes mspin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {canEdit && (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="https://arxiv.org/abs/..."
          style={{
            flex: 1, background: "#06060c", border: "1px solid #14141e",
            borderRadius: 8, padding: "8px 12px", color: "#c0c0d8",
            fontSize: 12, outline: "none", fontFamily: "monospace",
            transition: "border-color 0.15s",
          }}
          onFocus={e  => (e.currentTarget.style.borderColor = "#4A90D9")}
          onBlur={e   => (e.currentTarget.style.borderColor = "#14141e")}
        />
        <button
          onClick={handleAdd}
          disabled={add.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: add.isPending ? "#0e1e2e" : "#4A90D9",
            color:      add.isPending ? "#4A90D9" : "#fff",
            cursor: add.isPending ? "default" : "pointer",
            fontSize: 12, fontWeight: 500, transition: "all 0.15s", whiteSpace: "nowrap",
          }}>
          {add.isPending
            ? <RefreshCw size={12} style={{ animation: "mspin 1s linear infinite" }} />
            : <Plus size={12} />}
          {add.isPending ? t("sourcesTab.analyzingShort") : t("actions.add")}
        </button>
      </div>
      )}

      {sources.length > 0 && (
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: t("sourcesTab.count.sources"), val: sources.length, c: "#303048" },
            { label: t("sourcesTab.count.confirms"), val: confirms,       c: "#1ABC9C" },
            { label: t("sourcesTab.count.refutes"),  val: refutes,        c: "#E74C3C" },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              background: "#08080f", border: "1px solid #12121e",
              borderRadius: 8, padding: "6px 12px", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c, fontFamily: "monospace" }}>{val}</div>
              <div style={{ fontSize: 12, color: "#9999a1" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9999a1", fontSize: 13 }}>
          {t("sourcesTab.loading")}
        </div>
      ) : sources.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
          <p style={{ color: "#9999a1", fontSize: 13, margin: "0 0 5px" }}>{t("sourcesTab.empty.title")}</p>
          <p style={{ color: "#181828", fontSize: 12, margin: 0 }}>
            {t("sourcesTab.empty.subtitle")}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sources.map(src => (
            <SourceCard
              key={src.id}
              src={src}
              onSetVerdict={v => setVerdict.mutate({ docId: src.id, verdict: v })}
              onDelete={async () => { if (await askConfirmText(t("sourcesTab.confirmDelete"))) remove.mutate(src.id) }}
              canEdit={canEdit}
              tSrc={(field, fallback) => tSources(src, field, fallback)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
