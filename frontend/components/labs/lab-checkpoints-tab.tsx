"use client"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftRight, Camera, Check, Copy, Eye, Globe, ShieldCheck } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { theme, v2, formatEntityStamp } from "@/lib/theme"
import { Modal } from "@/components/ui/modal"
import { LC_CSS, card, chip, eyebrow, muted } from "@/components/labs/lab-checkpoints-style"
import { LabCheckpointView } from "@/components/labs/lab-checkpoint-view"
import { LabCheckpointDiff } from "@/components/labs/lab-checkpoint-diff"
import {
  checkpointsKey, checkpointsStorageKey, formatBytes, labCheckpointsApi, parseCheckpointError, shortHash, verifyProblemKey,
  type Checkpoint, type VerifyResult,
} from "@/lib/lab-checkpoints-api"

type Screen = { kind: "view"; id: number } | { kind: "diff"; from: number; to: number } | null

interface Props { labId: number; labIsPublic: boolean; canPublish: boolean }

/** Вкладка «Снимки» — только участникам: полная копия лаборатории на момент времени. */
export function LabCheckpointsTab({ labId, labIsPublic, canPublish }: Props) {
  const t = useT()
  const qc = useQueryClient()
  const locale = useStore(s => s.locale)
  const [title, setTitle] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null)
  const [verified, setVerified] = useState<Record<number, VerifyResult>>({})
  const [copied, setCopied] = useState<number | null>(null)
  const [showFull, setShowFull] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [screen, setScreen] = useState<Screen>(null)
  const [picked, setPicked] = useState<number[]>([])

  const errText = (e: unknown) => { const i = parseCheckpointError(e); return t(i.key, i.params) }
  const refresh = () => qc.invalidateQueries({ queryKey: checkpointsKey(labId) }) // под тем же префиксом лежит и «занято места»

  const list = useQuery({
    queryKey: checkpointsKey(labId),
    queryFn: () => labCheckpointsApi.list(labId),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const storage = useQuery({ queryKey: checkpointsStorageKey(labId), queryFn: () => labCheckpointsApi.storage(labId) })

  const create = useMutation({
    mutationFn: () => labCheckpointsApi.create(labId, title.trim() || null),
    onMutate: () => setCreateError(null),
    onSuccess: () => { setTitle(""); refresh() },
    onError: e => { setCreateError(errText(e)); refresh() },
  })
  const verify = useMutation({
    mutationFn: (id: number) => labCheckpointsApi.verify(labId, id),
    onMutate: () => setRowError(null),
    onSuccess: (res, id) => setVerified(prev => ({ ...prev, [id]: res })),
    onError: (e, id) => setRowError({ id, text: errText(e) }),
  })
  const publish = useMutation({
    mutationFn: (v: { id: number; value: boolean }) => labCheckpointsApi.publish(labId, v.id, v.value),
    onMutate: () => setRowError(null),
    onSuccess: () => { setConfirmId(null); refresh() },
    onError: (e, v) => { setConfirmId(null); setRowError({ id: v.id, text: errText(e) }); refresh() },
  })

  const copyHash = async (cp: Checkpoint) => {
    try {
      await navigator.clipboard.writeText(cp.commit_hash)
      setCopied(cp.id)
      setTimeout(() => setCopied(c => (c === cp.id ? null : c)), 1800)
    } catch {
      setShowFull(cp.id) // буфер недоступен (не https): показываем хеш целиком, чтобы его можно было выделить
    }
  }
  const togglePick = (id: number) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2)))
  const compare = () => {
    if (picked.length !== 2) return
    const [a, b] = [...picked].sort((x, y) => x - y) // от старого к новому
    setScreen({ kind: "diff", from: a, to: b })
  }

  const stampOf = (raw: string) => { const s = formatEntityStamp(raw, locale); return s ? `${s.day} · ${s.time}` : "" }
  const problemText = (p: string) => { const v = verifyProblemKey(p); return t(v.key, v.params) }

  const items = list.data ?? []
  const st = storage.data
  const pct = st && st.budget_bytes > 0 ? Math.min(100, Math.round((st.used_bytes / st.budget_bytes) * 100)) : 0

  const byId = new Map(items.map(c => [c.id, c]))
  if (screen?.kind === "view") {
    const cp = byId.get(screen.id)
    if (cp) return <LabCheckpointView labId={labId} cp={cp} onBack={() => setScreen(null)} />
  }
  if (screen?.kind === "diff") {
    const a = byId.get(screen.from)
    const b = byId.get(screen.to)
    if (a && b) return <LabCheckpointDiff labId={labId} from={a} to={b} onBack={() => setScreen(null)} />
  }

  const renderRow = (cp: Checkpoint) => {
    const res = verified[cp.id]
    const verifying = verify.isPending && verify.variables === cp.id
    const publishing = publish.isPending && publish.variables?.id === cp.id
    return (
      <div key={cp.id} data-testid="checkpoint-row" style={{ position: "relative" }}>
        <span aria-hidden="true" style={{
          position: "absolute", left: -27, top: 20, width: 9, height: 9, borderRadius: "50%",
          background: cp.is_published ? v2.teal : theme.tx3, boxShadow: `0 0 0 3px ${v2.surf}`,
        }} />
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: v2.t1, overflowWrap: "anywhere" }}>
                {cp.title ?? t("labCheckpoints.untitled")}
              </div>
              <div style={{ ...muted, marginTop: 2 }}>
                {stampOf(cp.created_at)}
                {" · "}
                {cp.created_by_username ? t("labCheckpoints.row.author", { name: cp.created_by_username }) : t("labCheckpoints.row.authorUnknown")}
                {" · "}{t("labCheckpoints.row.items", { n: cp.item_count })}
                {cp.blob_bytes > 0 && <>{" · "}{t("labCheckpoints.row.files", { size: formatBytes(cp.blob_bytes) })}</>}
              </div>
            </div>
            {cp.is_published && (
              <span style={{ ...chip, color: v2.teal }}><Globe size={10} />{t("labCheckpoints.row.published")}</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...muted, fontSize: 11 }}>{t("labCheckpoints.row.hashLabel")}</span>
            <code title={cp.commit_hash} style={{ fontFamily: theme.mono, fontSize: 12, color: v2.t2 }}>{shortHash(cp.commit_hash)}</code>
            <button type="button" className="lc-link" onClick={() => copyHash(cp)} title={t("labCheckpoints.row.copyHash")}
              aria-label={t("labCheckpoints.row.copyHash")}>
              {copied === cp.id ? <Check size={12} /> : <Copy size={12} />}
              {copied === cp.id && t("labCheckpoints.row.copied")}
            </button>
          </div>
          {showFull === cp.id && (
            <code style={{ fontFamily: theme.mono, fontSize: 11, color: v2.t2, wordBreak: "break-all", userSelect: "all" }}>{cp.commit_hash}</code>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="lc-btn" onClick={() => setScreen({ kind: "view", id: cp.id })}>
              <Eye size={13} />{t("labCheckpoints.row.open")}
            </button>
            {items.length >= 2 && (
              <button type="button" className={`lc-btn${picked.includes(cp.id) ? " lc-on" : ""}`} aria-pressed={picked.includes(cp.id)}
                onClick={() => togglePick(cp.id)}>
                <ArrowLeftRight size={13} />{t("labCheckpoints.compare.label")}
              </button>
            )}
            <button type="button" className="lc-btn" disabled={verify.isPending} onClick={() => verify.mutate(cp.id)}>
              <ShieldCheck size={13} />
              {verifying ? t("labCheckpoints.verify.running") : t("labCheckpoints.verify.button")}
            </button>
            {canPublish && cp.is_published && (
              <button type="button" className="lc-btn" disabled={publish.isPending}
                onClick={() => publish.mutate({ id: cp.id, value: false })}>
                {publishing ? t("labCheckpoints.publish.working") : t("labCheckpoints.publish.unpublish")}
              </button>
            )}
            {canPublish && !cp.is_published && labIsPublic && (
              <button type="button" className="lc-btn" disabled={publish.isPending} onClick={() => setConfirmId(cp.id)}>
                <Globe size={13} />{t("labCheckpoints.publish.button")}
              </button>
            )}
          </div>

          {res && res.ok && (
            <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: v2.teal }}>
                <ShieldCheck size={13} />{t("labCheckpoints.verify.ok")}
              </div>
              <div style={muted}>{t("labCheckpoints.verify.anchorNote")}</div>
            </div>
          )}
          {res && !res.ok && (
            <div role="alert" style={{ fontSize: 12, color: v2.red, lineHeight: 1.55 }}>
              {t("labCheckpoints.verify.failed")}
              <ul style={{ listStyle: "disc", paddingLeft: 18, marginTop: 4 }}>
                {res.problems.map(p => <li key={p}>{problemText(p)}</li>)}
              </ul>
            </div>
          )}
          {rowError?.id === cp.id && <div style={{ fontSize: 12, color: v2.red }}>{rowError.text}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{LC_CSS}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: v2.t1 }}>{t("labCheckpoints.title")}</h2>
        <p style={{ ...muted, fontSize: 13, color: v2.t2, maxWidth: 760 }}>{t("labCheckpoints.intro")}</p>
      </div>

      <div style={card}>
        <div style={eyebrow}>{t("labCheckpoints.create.heading")}</div>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          onSubmit={e => { e.preventDefault(); if (!create.isPending) create.mutate() }}>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder={t("labCheckpoints.create.placeholder")} style={{ flex: "1 1 260px", minWidth: 0 }} />
          <button type="submit" className="lc-btn lc-primary" disabled={create.isPending}>
            <Camera size={14} />
            {create.isPending ? t("labCheckpoints.create.creating") : t("labCheckpoints.create.button")}
          </button>
        </form>
        {createError && <div role="alert" style={{ fontSize: 12, color: v2.red, lineHeight: 1.55 }}>{createError}</div>}
        {st && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: theme.tx3 }}>
              <span>{t("labCheckpoints.storage.label")}</span>
              <span style={{ fontFamily: theme.mono }}>
                {t("labCheckpoints.storage.of", { used: formatBytes(st.used_bytes), budget: formatBytes(st.budget_bytes) })}
              </span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
              style={{ height: 6, borderRadius: 3, background: v2.bd, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: st.warn ? v2.amber : v2.teal }} />
            </div>
            {st.warn && <div style={{ fontSize: 12, color: v2.amber, lineHeight: 1.55 }}>{t("labCheckpoints.storage.warn")}</div>}
          </div>
        )}
        {canPublish && !labIsPublic && <div style={muted}>{t("labCheckpoints.publish.needsPublicLab")}</div>}
      </div>

      {list.isLoading && <div style={muted}>{t("labCheckpoints.list.loading")}</div>}
      {list.isError && (
        <div style={muted}>
          {t("labCheckpoints.list.loadError")}{" "}
          <button type="button" className="lc-link" onClick={() => list.refetch()}>{t("labCheckpoints.list.retry")}</button>
        </div>
      )}
      {!list.isLoading && !list.isError && items.length === 0 && <div style={{ ...muted, maxWidth: 560 }}>{t("labCheckpoints.list.empty")}</div>}

      {items.length >= 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="lc-btn lc-primary" disabled={picked.length !== 2} onClick={compare}>
            <ArrowLeftRight size={13} />{t("labCheckpoints.compare.button")}
          </button>
          {picked.length < 2 && <span style={muted}>{t("labCheckpoints.compare.hint")}</span>}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 22, marginLeft: 4, borderLeft: `1px solid ${v2.bd2}` }}>
          {items.map(renderRow)}
        </div>
      )}

      <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title={t("labCheckpoints.publish.confirmTitle")} size="sm">
        <p style={{ fontSize: 13, color: v2.t2, lineHeight: 1.65, marginBottom: 20 }}>{t("labCheckpoints.publish.confirmBody")}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="lc-btn" onClick={() => setConfirmId(null)}>{t("labCheckpoints.publish.cancel")}</button>
          <button type="button" className="lc-btn lc-primary" disabled={publish.isPending}
            onClick={() => { if (confirmId !== null) publish.mutate({ id: confirmId, value: true }) }}>
            {publish.isPending ? t("labCheckpoints.publish.working") : t("labCheckpoints.publish.confirm")}
          </button>
        </div>
      </Modal>
    </div>
  )
}
