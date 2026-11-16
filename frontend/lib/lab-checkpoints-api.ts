import { labKeys } from "@/lib/lab-queries"
import { api, API_BASE_URL } from "@/lib/api"

// Контракт: backend/app/api/v1/lab_checkpoints.py, описание — backend/docs/LAB_CHECKPOINTS.md.

export interface StorageStatus { used_bytes: number; budget_bytes: number; warn: boolean }

export interface Checkpoint {
  id: number
  lab_id: number
  title: string | null
  created_at: string
  created_by: number | null
  created_by_username: string | null
  parent_id: number | null
  is_published: boolean
  published_at: string | null
  item_count: number
  blob_bytes: number
  schema_version: number
  tree_hash: string
  commit_hash: string
  storage?: StorageStatus | null // только в ответе на создание
}

export interface VerifyResult { ok: boolean; problems: string[]; commit_hash: string }

// Ключ занятого места лежит под ключом списка: инвалидация списка обновляет и его.
export const checkpointsKey = labKeys.checkpoints
export const checkpointsStorageKey = labKeys.checkpointsStorage

const base = (labId: number) => `/api/v1/labs/${labId}/checkpoints`

export const labCheckpointsApi = {
  list: (labId: number) => api.get(base(labId)).then(r => r.data as Checkpoint[]),
  storage: (labId: number) => api.get(`${base(labId)}/storage`).then(r => r.data as StorageStatus),
  create: (labId: number, title: string | null) => api.post(base(labId), { title }).then(r => r.data as Checkpoint),
  // files=true: заодно проверяется наличие файлов-блобов.
  verify: (labId: number, cid: number) =>
    api.get(`${base(labId)}/${cid}/verify`, { params: { files: true } }).then(r => r.data as VerifyResult),
  publish: (labId: number, cid: number, isPublished: boolean) =>
    api.patch(`${base(labId)}/${cid}/publish`, { is_published: isPublished }).then(r => r.data as Checkpoint),
  view: (labId: number, cid: number) => api.get(`${base(labId)}/${cid}`).then(r => r.data as CheckpointView),
  diff: (labId: number, from: number, to: number) =>
    api.get(`${base(labId)}/diff`, { params: { from, to } }).then(r => r.data as CheckpointDiff),
  fileUrl: (labId: number, cid: number, itemId: number) => `${API_BASE_URL}${base(labId)}/${cid}/files/${itemId}`,
}

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false })

/** 1536 -> «1.5 KB». Единицы латиницей: не зависят от языка интерфейса. */
export function formatBytes(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—"
  if (n < 1024) return `${Math.round(n)} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${NUM.format(v)} ${units[i]}`
}

export const shortHash = (h: string) => h.slice(0, 12)

export const CHECKPOINT_ERROR_KEYS = [
  "labCheckpoints.err.network", "labCheckpoints.err.generic", "labCheckpoints.err.forbidden",
  "labCheckpoints.err.notFound", "labCheckpoints.err.budget", "labCheckpoints.err.rateLimit",
  "labCheckpoints.err.tooLarge", "labCheckpoints.err.conflict", "labCheckpoints.err.labNotPublic",
] as const

export interface CheckpointErrorInfo { key: string; params: Record<string, string | number> }

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
const num = (v: unknown): number => (typeof v === "number" ? v : NaN)

/** Ошибка запроса к снимкам -> ключ словаря + подстановки. detail бывает объектом {code,...} (409), строкой
 *  (403/404) и массивом (422); парсер переживает любую форму и никогда не бросает. */
export function parseCheckpointError(err: unknown): CheckpointErrorInfo {
  const e = rec(err)
  const response = rec(e?.response)
  if (!response) {
    // axios без response — запрос не дошёл до сервера; любое другое исключение — наш баг, не «нет связи».
    return { key: e?.isAxiosError === true ? "labCheckpoints.err.network" : "labCheckpoints.err.generic", params: {} }
  }
  if (response.status === 403) return { key: "labCheckpoints.err.forbidden", params: {} }
  if (response.status === 404) return { key: "labCheckpoints.err.notFound", params: {} }
  if (response.status === 409) {
    const d = rec(rec(response.data)?.detail)
    switch (d?.code) {
      case "checkpoint_budget_exceeded":
        return { key: "labCheckpoints.err.budget", params: {
          used: formatBytes(num(d.used_bytes)), budget: formatBytes(num(d.budget_bytes)), needed: formatBytes(num(d.needed_bytes)),
        } }
      case "checkpoint_rate_limit": {
        const n = num(d.per_hour)
        return { key: "labCheckpoints.err.rateLimit", params: { n: Number.isFinite(n) ? n : "?" } }
      }
      case "checkpoint_too_large":
        return { key: "labCheckpoints.err.tooLarge", params: { size: formatBytes(num(d.bytes)), limit: formatBytes(num(d.limit)) } }
      case "checkpoint_conflict": return { key: "labCheckpoints.err.conflict", params: {} }
      case "lab_not_public": return { key: "labCheckpoints.err.labNotPublic", params: {} }
    }
  }
  return { key: "labCheckpoints.err.generic", params: {} }
}

export const VERIFY_PROBLEM_KEYS = [
  "labCheckpoints.verify.problem.item", "labCheckpoints.verify.problem.itemCount", "labCheckpoints.verify.problem.tree",
  "labCheckpoints.verify.problem.commit", "labCheckpoints.verify.problem.parent", "labCheckpoints.verify.problem.blob",
  "labCheckpoints.verify.problem.unknown",
] as const

/** Проблема из ответа verify ("item:<object_key>", "item_count", "tree", "commit", "parent", "blob:<sha>") -> ключ словаря. */
export function verifyProblemKey(problem: string): { key: string; params: Record<string, string> } {
  if (problem === "item_count") return { key: "labCheckpoints.verify.problem.itemCount", params: {} }
  if (problem === "tree") return { key: "labCheckpoints.verify.problem.tree", params: {} }
  if (problem === "commit") return { key: "labCheckpoints.verify.problem.commit", params: {} }
  if (problem === "parent") return { key: "labCheckpoints.verify.problem.parent", params: {} }
  if (problem.startsWith("item:")) return { key: "labCheckpoints.verify.problem.item", params: { what: problem.slice(5) } }
  if (problem.startsWith("blob:")) return { key: "labCheckpoints.verify.problem.blob", params: { what: shortHash(problem.slice(5)) } }
  return { key: "labCheckpoints.verify.problem.unknown", params: { what: problem } }
}

// Просмотр снимка (group_items на бэкенде): записи по типам, дети внутри. У файлов есть item_id — по нему скачивание.
export interface ViewChild {
  object_key: string
  data: Record<string, unknown>
  item_id?: number | null
  blob_sha256?: string | null
  blob_size?: number | null
  file_missing?: boolean
}
export interface ViewNode { entity_id: number; data: Record<string, unknown>; children: Record<string, ViewChild[]> }
export interface CheckpointView {
  checkpoint: Checkpoint
  audience: "member" | "public"
  users?: Record<string, string> // только участникам: текущие имена по user_id
  lab: { data: Record<string, unknown>; children: Record<string, ViewChild[]> } | null
  entities: Record<string, ViewNode[]>
  results: ViewNode[]
  links: Record<string, unknown>[]
  entity_hypotheses: Record<string, unknown>[]
  scale_defs: Record<string, unknown>[]
  trashed: { entity_type: string; entity_id: number }[]
}

export type DiffStatus = "added" | "removed" | "changed" | "trashed" | "restored"
export interface DiffRecord {
  kind: string
  entity_type: string
  entity_id: number | null
  object_key: string
  status: DiffStatus
  label?: string | null
  changed_fields?: Record<string, { old?: unknown; new?: unknown }>
  data?: Record<string, unknown>
  blob?: { old: string | null; new: string | null }
}
export interface CheckpointDiff {
  from: Checkpoint
  to: Checkpoint
  audience: string
  summary: Record<string, number>
  records: DiffRecord[]
}
