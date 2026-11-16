"use client"
import { useState, type CSSProperties } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ChevronDown, ChevronRight, Download } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { theme, v2, formatEntityStamp } from "@/lib/theme"
import { DEFAULT_SCALES } from "@/lib/scales"
import { roleLabel } from "@/lib/lab-roles"
import { stageLabel } from "@/lib/stage-labels"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { LC_CSS, card, chip, muted } from "@/components/labs/lab-checkpoints-style"
import {
  checkpointsKey, formatBytes, labCheckpointsApi, shortHash, type Checkpoint, type ViewChild, type ViewNode,
} from "@/lib/lab-checkpoints-api"
import {
  ENTITY_TYPE_ORDER, TYPE_PLURAL_KEYS, describeChild, entityBody, entityTitle, kindLabel, orderedChildGroups, toPlainText, typeLabel,
  type DescribeEnv, type T,
} from "@/lib/lab-checkpoints-view"

interface Ctx { labId: number; cpId: number; t: T; env: DescribeEnv; userName: (id: unknown) => string }

const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 700, color: v2.t2, textTransform: "uppercase", letterSpacing: "0.06em" }
const lineStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 13, color: v2.t2, lineHeight: 1.55 }

function ChildEntry({ kind, e, ctx }: { kind: string; e: ViewChild; ctx: Ctx }) {
  const { t } = ctx
  const text = describeChild(kind, e.data, ctx.env)
  if (kind === "attachment" || kind === "image") {
    const ready = typeof e.item_id === "number" && !e.file_missing
    return (
      <div style={lineStyle}>
        <span style={{ overflowWrap: "anywhere" }}>{text || "—"}</span>
        {typeof e.blob_size === "number" && <span style={muted}>{formatBytes(e.blob_size)}</span>}
        {ready
          ? (
            <a className="lc-link" download href={labCheckpointsApi.fileUrl(ctx.labId, ctx.cpId, e.item_id as number)}>
              <Download size={12} />{t("labCheckpoints.view.download")}
            </a>
          )
          : <span style={muted}>{t("labCheckpoints.view.fileMissing")}</span>}
      </div>
    )
  }
  if (kind === "comment" || kind === "post" || kind === "post_comment") {
    return (
      <div style={lineStyle}>
        <span style={{ color: v2.t1, fontWeight: 600 }}>{ctx.userName(e.data.author_id)}</span>
        <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", flex: "1 1 240px", minWidth: 0 }}>{text}</span>
      </div>
    )
  }
  if (kind === "lab_member") {
    return (
      <div style={lineStyle}>
        <span style={{ color: v2.t1, fontWeight: 600 }}>{ctx.userName(e.data.user_id)}</span>
        <span style={muted}>{text}</span>
      </div>
    )
  }
  return <div style={{ ...lineStyle, overflowWrap: "anywhere" }}>{text || "—"}</div>
}

function Groups({ groups, ctx }: { groups: [string, ViewChild[]][]; ctx: Ctx }) {
  return (
    <>
      {groups.map(([kind, entries]) => (
        <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ ...muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {kindLabel(ctx.t, kind)} · {entries.length}
          </div>
          {entries.map(e => <ChildEntry key={e.object_key} kind={kind} e={e} ctx={ctx} />)}
        </div>
      ))}
    </>
  )
}

function EntityCard({ type, node, ctx }: { type: string; node: ViewNode; ctx: Ctx }) {
  const [open, setOpen] = useState(false)
  const groups = orderedChildGroups(node.children)
  const body = entityBody(type, node.data)
  return (
    <div data-testid="checkpoint-entity" style={{ ...card, gap: 8 }}>
      <button type="button" className="lc-link" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ justifyContent: "flex-start", gap: 8, width: "100%", textAlign: "left", fontSize: 14, fontWeight: 600, color: v2.t1 }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{entityTitle(type, node.data, node.entity_id)}</span>
      </button>
      {groups.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {groups.map(([kind, entries]) => (
            <span key={kind} style={{ ...chip, color: v2.t2 }}>{kindLabel(ctx.t, kind)} {entries.length}</span>
          ))}
        </div>
      )}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
          {body && <div style={{ fontSize: 13, color: v2.t2, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</div>}
          <Groups groups={groups} ctx={ctx} />
        </div>
      )}
    </div>
  )
}

interface Props { labId: number; cp: Checkpoint; onBack: () => void }

/** Как лаборатория выглядела на момент снимка: записи по типам, их дети, участники, корзина. Только чтение. */
export function LabCheckpointView({ labId, cp, onBack }: Props) {
  const t = useT()
  const locale = useStore(s => s.locale)
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES.map(s => s.name)))
  const q = useQuery({
    queryKey: [...checkpointsKey(labId), "view", cp.id],
    queryFn: () => labCheckpointsApi.view(labId, cp.id),
    staleTime: Infinity, // снимок неизменяем
  })
  const data = q.data
  const users = data?.users ?? {}
  const scaleDefs = data?.scale_defs ?? []

  const stamp = (() => { const s = formatEntityStamp(cp.created_at, locale); return s ? `${s.day} · ${s.time}` : "" })()
  const userName = (id: unknown): string => (typeof id === "number" && users[String(id)]) || t("labCheckpoints.view.deletedUser")
  const scaleName = (id: string): string => {
    const m = /^custom_(\d+)$/.exec(id)
    if (m) {
      const def = scaleDefs.find(d => d.id === Number(m[1]))
      return typeof def?.name === "string" ? def.name : id
    }
    const builtin = DEFAULT_SCALES.find(s => s.id === id)
    return builtin ? dt(builtin.name) : id
  }
  const env: DescribeEnv = { scaleName, stage: v => stageLabel(t, v), role: v => roleLabel(t, v) }
  const ctx: Ctx = { labId, cpId: cp.id, t, env, userName }

  const entityTypes = data ? ENTITY_TYPE_ORDER.filter(tp => (data.entities[tp] ?? []).length > 0) : []
  const hasContent = !!data && (entityTypes.length > 0 || data.results.length > 0)

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
      <style>{LC_CSS}</style>
      <div>
        <button type="button" className="lc-btn" onClick={onBack}><ArrowLeft size={13} />{t("labCheckpoints.view.back")}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: v2.t1, overflowWrap: "anywhere" }}>{cp.title ?? t("labCheckpoints.untitled")}</h2>
        <div style={muted}>{stamp} · <code title={cp.commit_hash} style={{ fontFamily: theme.mono }}>{shortHash(cp.commit_hash)}</code></div>
      </div>

      {q.isLoading && <div style={muted}>{t("labCheckpoints.view.loading")}</div>}
      {q.isError && (
        <div style={muted}>
          {t("labCheckpoints.view.loadError")}{" "}
          <button type="button" className="lc-link" onClick={() => q.refetch()}>{t("labCheckpoints.list.retry")}</button>
        </div>
      )}

      {data && (
        <>
          {data.lab && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={sectionTitle}>{t("labCheckpoints.view.lab")}</div>
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, color: v2.t1, overflowWrap: "anywhere" }}>{toPlainText(data.lab.data.name, 200)}</div>
                {toPlainText(data.lab.data.description, 2000) && (
                  <div style={{ fontSize: 13, color: v2.t2, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{toPlainText(data.lab.data.description, 2000)}</div>
                )}
                {(data.lab.children.lab_member ?? []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ ...muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("labCheckpoints.view.members")}</div>
                    {(data.lab.children.lab_member ?? []).map(m => <ChildEntry key={m.object_key} kind="lab_member" e={m} ctx={ctx} />)}
                  </div>
                )}
              </div>
            </section>
          )}

          {entityTypes.map(tp => (
            <section key={tp} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={sectionTitle}>{t(TYPE_PLURAL_KEYS[tp])} · {data.entities[tp].length}</div>
              {data.entities[tp].map(n => <EntityCard key={n.entity_id} type={tp} node={n} ctx={ctx} />)}
            </section>
          ))}

          {data.results.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={sectionTitle}>{t("labCheckpoints.view.results")} · {data.results.length}</div>
              {data.results.map(n => <EntityCard key={n.entity_id} type="result" node={n} ctx={ctx} />)}
            </section>
          )}

          {!hasContent && <div style={muted}>{t("labCheckpoints.view.empty")}</div>}

          {data.trashed.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={sectionTitle}>{t("labCheckpoints.view.trashed")} · {data.trashed.length}</div>
              {data.trashed.map(x => (
                <div key={`${x.entity_type}:${x.entity_id}`} style={lineStyle}>{typeLabel(t, x.entity_type)} #{x.entity_id}</div>
              ))}
            </section>
          )}

          {(data.links.length > 0 || scaleDefs.length > 0) && (
            <div style={muted}>
              {data.links.length > 0 && <>{t("labCheckpoints.view.links", { n: data.links.length })}</>}
              {data.links.length > 0 && scaleDefs.length > 0 && " · "}
              {scaleDefs.length > 0 && <>{t("labCheckpoints.view.scales", { n: scaleDefs.length })}</>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
