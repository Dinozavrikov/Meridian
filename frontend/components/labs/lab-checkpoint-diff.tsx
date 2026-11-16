"use client"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { theme, v2, formatEntityStamp } from "@/lib/theme"
import { DEFAULT_SCALES } from "@/lib/scales"
import { roleLabel } from "@/lib/lab-roles"
import { stageLabel } from "@/lib/stage-labels"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { fieldLabelKey, formatHistoryValue, type ValueEnv } from "@/lib/entity-history-view"
import { DiffField } from "@/components/entities/history-diff"
import { LC_CSS, card, chip, muted } from "@/components/labs/lab-checkpoints-style"
import { checkpointsKey, labCheckpointsApi, type Checkpoint, type DiffRecord, type DiffStatus } from "@/lib/lab-checkpoints-api"
import { DIFF_STATUS_KEYS, describeChild, kindLabel, typeLabel, type DescribeEnv, type T } from "@/lib/lab-checkpoints-view"

const STATUS_COLOR: Record<DiffStatus, string> = {
  added: v2.teal, removed: v2.red, changed: v2.amber, trashed: theme.tx3, restored: v2.teal,
}
const STATUS_ORDER: DiffStatus[] = ["added", "changed", "removed", "trashed", "restored"]
// У этих видов ссылка «тип + номер записи» ничего не добавляет к названию вида.
const NO_REF = new Set(["link", "scale_def", "entity_hypothesis", "lab"])

interface RowEnv { t: T; env: ValueEnv; describe: DescribeEnv }

function RecordRow({ r, e }: { r: DiffRecord; e: RowEnv }) {
  const { t } = e
  const fieldLabel = (f: string) => { const key = fieldLabelKey(f); return key ? t(key) : f }
  let head: string
  if (r.kind === "entity") {
    head = `${typeLabel(t, r.entity_type)} · ${r.label ?? `#${r.entity_id}`}`
  } else {
    const ref = r.kind === "result"
      ? ` #${r.entity_id}`
      : r.entity_id != null && !NO_REF.has(r.kind) ? ` · ${typeLabel(t, r.entity_type)} #${r.entity_id}` : ""
    head = `${kindLabel(t, r.kind)}${ref}`
  }
  const summary = r.kind !== "entity" && (r.status === "added" || r.status === "removed") ? describeChild(r.kind, r.data ?? {}, e.describe) : ""
  const fields = Object.entries(r.changed_fields ?? {})
  return (
    <div data-testid="checkpoint-diff-record" style={{ ...card, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...chip, color: STATUS_COLOR[r.status] }}>{t(DIFF_STATUS_KEYS[r.status])}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: v2.t1, overflowWrap: "anywhere", flex: "1 1 200px", minWidth: 0 }}>{head}</span>
      </div>
      {summary && <div style={{ fontSize: 12, color: v2.t2, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{summary}</div>}
      {fields.map(([field, ch]) => (
        <DiffField key={field} label={fieldLabel(field)} oldText={formatHistoryValue(field, ch?.old, e.env)} newText={formatHistoryValue(field, ch?.new, e.env)} />
      ))}
      {r.blob && <div style={muted}>{t("labCheckpoints.diff.fileChanged")}</div>}
    </div>
  )
}

interface Props { labId: number; from: Checkpoint; to: Checkpoint; onBack: () => void }

/** Что изменилось между двумя снимками (считает сервер из двух копий: от старого к новому). */
export function LabCheckpointDiff({ labId, from, to, onBack }: Props) {
  const t = useT()
  const locale = useStore(s => s.locale)
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES.map(s => s.name)))
  const q = useQuery({
    queryKey: [...checkpointsKey(labId), "diff", from.id, to.id],
    queryFn: () => labCheckpointsApi.diff(labId, from.id, to.id),
    staleTime: Infinity, // снимки неизменяемы
  })

  const stampOf = (raw: string) => { const s = formatEntityStamp(raw, locale); return s ? `${s.day} · ${s.time}` : undefined }
  const name = (cp: Checkpoint) => cp.title ?? stampOf(cp.created_at) ?? `#${cp.id}`
  const env: ValueEnv = { yes: t("history.yes"), no: t("history.no"), stamp: raw => stampOf(raw), word: (_field, raw) => raw }
  const describe: DescribeEnv = {
    scaleName: id => { const b = DEFAULT_SCALES.find(s => s.id === id); return b ? dt(b.name) : id },
    stage: v => stageLabel(t, v), role: v => roleLabel(t, v),
  }
  const rowEnv: RowEnv = { t, env, describe }

  const records = q.data?.records ?? []
  const entityRecords = records.filter(r => r.kind === "entity")
  const others = records.filter(r => r.kind !== "entity")
  const kinds = [...new Set(others.map(r => r.kind))]
  const summary = q.data?.summary ?? {}
  const hasRemoved = records.some(r => r.status === "removed")

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{LC_CSS}</style>
      <div>
        <button type="button" className="lc-btn" onClick={onBack}><ArrowLeft size={13} />{t("labCheckpoints.view.back")}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: v2.t1 }}>{t("labCheckpoints.diff.title")}</h2>
        <div style={muted}>{t("labCheckpoints.diff.range", { from: name(from), to: name(to) })}</div>
      </div>

      {q.isLoading && <div style={muted}>{t("labCheckpoints.diff.loading")}</div>}
      {q.isError && (
        <div style={muted}>
          {t("labCheckpoints.diff.loadError")}{" "}
          <button type="button" className="lc-link" onClick={() => q.refetch()}>{t("labCheckpoints.list.retry")}</button>
        </div>
      )}

      {q.data && records.length === 0 && <div style={{ ...muted, maxWidth: 560 }}>{t("labCheckpoints.diff.empty")}</div>}

      {records.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_ORDER.filter(s => (summary[s] ?? 0) > 0).map(s => (
            <span key={s} style={{ ...chip, color: STATUS_COLOR[s] }}>{t(DIFF_STATUS_KEYS[s])} {summary[s]}</span>
          ))}
        </div>
      )}

      {entityRecords.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("labCheckpoints.diff.entities")}</div>
          {entityRecords.map(r => <RecordRow key={r.object_key} r={r} e={rowEnv} />)}
        </section>
      )}

      {others.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("labCheckpoints.diff.content")}</div>
          {kinds.flatMap(k => others.filter(r => r.kind === k)).map(r => <RecordRow key={r.object_key} r={r} e={rowEnv} />)}
        </section>
      )}

      {hasRemoved && <div style={{ ...muted, maxWidth: 640 }}>{t("labCheckpoints.diff.removedNote")}</div>}
    </div>
  )
}
