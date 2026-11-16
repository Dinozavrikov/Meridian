import type { DiffStatus, ViewChild } from "@/lib/lab-checkpoints-api"

export type T = (key: string, params?: Record<string, string | number>) => string

export const ENTITY_TYPE_ORDER = ["observation", "hypothesis", "prediction", "worldview", "question", "task"] as const

const TITLE_FIELD: Record<string, string> = {
  observation: "title", hypothesis: "name", prediction: "title", worldview: "belief", question: "title", task: "name", result: "title",
}
const BODY_FIELD: Record<string, string> = {
  observation: "text", hypothesis: "description", prediction: "text", question: "text", task: "description", result: "body",
}

const NAMED: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }

/** Текст записи (часто это разметка редактора) -> обычный текст: теги вырезаются, остальное показывается
 *  как текст и экранируется самим React. Никакой разметки в страницу не попадает. */
export function toPlainText(value: unknown, limit = 0): string {
  if (typeof value !== "string") return ""
  const text = value
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => NAMED[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return limit > 0 && text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

export function entityTitle(type: string, data: Record<string, unknown>, id: number): string {
  const field = TITLE_FIELD[type]
  return (field ? toPlainText(data[field], 160) : "") || `#${id}`
}

export function entityBody(type: string, data: Record<string, unknown>): string {
  const field = BODY_FIELD[type]
  return field ? toPlainText(data[field], 4000) : ""
}

const TYPE_KEYS = ["observation", "hypothesis", "prediction", "worldview", "question", "task", "result", "lab"] as const
export const TYPE_LABEL_KEYS: Record<string, string> = Object.fromEntries(TYPE_KEYS.map(k => [k, `labCheckpoints.type.${k}`]))
export const TYPE_PLURAL_KEYS: Record<string, string> = Object.fromEntries(
  [...ENTITY_TYPE_ORDER, "result"].map(k => [k, `labCheckpoints.typePlural.${k}`]),
)

export const CHILD_KIND_ORDER = [
  "tag", "scale_value", "stage", "comment", "source", "attachment", "image", "post", "post_comment",
  "task_scale", "task_scale_hypothesis", "hyp_status_history", "lab_member", "result_source_link",
] as const
const CHILD_KIND_ALL = [...CHILD_KIND_ORDER, "link", "scale_def", "entity_hypothesis", "result", "lab", "entity"]
export const CHILD_KIND_KEYS: Record<string, string> = Object.fromEntries(CHILD_KIND_ALL.map(k => [k, `labCheckpoints.child.${k}`]))

export const DIFF_STATUS_KEYS: Record<DiffStatus, string> = {
  added: "labCheckpoints.diff.status.added", removed: "labCheckpoints.diff.status.removed", changed: "labCheckpoints.diff.status.changed",
  trashed: "labCheckpoints.diff.status.trashed", restored: "labCheckpoints.diff.status.restored",
}

/** Все ключи словаря, которые строятся из карт (в исходниках их не найти поиском по t("...")): тест сверяет со словарём. */
export const CHECKPOINT_VIEW_KEYS: string[] = [
  ...Object.values(TYPE_LABEL_KEYS), ...Object.values(TYPE_PLURAL_KEYS), ...Object.values(CHILD_KIND_KEYS), ...Object.values(DIFF_STATUS_KEYS),
]

export const typeLabel = (t: T, type: string): string => (TYPE_LABEL_KEYS[type] ? t(TYPE_LABEL_KEYS[type]) : type)
export const kindLabel = (t: T, kind: string): string => (CHILD_KIND_KEYS[kind] ? t(CHILD_KIND_KEYS[kind]) : kind)

/** Дети записи в читаемом порядке; пустые группы отбрасываются, неизвестные виды идут в конце по алфавиту. */
export function orderedChildGroups(children: Record<string, ViewChild[]> | undefined): [string, ViewChild[]][] {
  const c = children ?? {}
  const known = new Set<string>(CHILD_KIND_ORDER)
  const kinds = [
    ...CHILD_KIND_ORDER.filter(k => (c[k]?.length ?? 0) > 0),
    ...Object.keys(c).filter(k => !known.has(k) && c[k].length > 0).sort(),
  ]
  return kinds.map(k => [k, c[k]])
}

export interface DescribeEnv {
  scaleName: (scaleId: string) => string
  stage: (value: string) => string
  role: (value: string) => string
}

/** Одна строка о ребёнке записи (без автора: автора добавляет интерфейс, у дифа имён нет). */
export function describeChild(kind: string, data: Record<string, unknown>, env: DescribeEnv): string {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "")
  switch (kind) {
    case "comment":
    case "post_comment": return toPlainText(data.content, 400)
    case "post": return [toPlainText(data.title, 120), toPlainText(data.content, 400)].filter(Boolean).join(" — ")
    case "tag": return s("name")
    case "source": return toPlainText(data.title, 160) || s("url")
    case "attachment": return s("filename")
    case "image": return s("caption") || s("description") || s("filename")
    case "stage": return env.stage(s("current_stage"))
    case "scale_value": return `${env.scaleName(s("scale_id"))}: ${String(data.value ?? "")}`
    case "task_scale": return `${s("name")}: ${String(data.current_val ?? "")}`
    case "task_scale_hypothesis": return `#${String(data.task_scale_id ?? "")} → #${String(data.hypothesis_id ?? "")}`
    case "hyp_status_history": return s("status")
    case "lab_member": return env.role(s("role"))
    case "result_source_link": return `#${String(data.source_document_id ?? "")}`
    default: return ""
  }
}
