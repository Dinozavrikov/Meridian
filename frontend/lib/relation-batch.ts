import { linkKey } from "@/lib/relation-view"
import { allowedLinkTypes } from "@/lib/link-vocab"

export const FIELD_STANCES = ["подтверждает", "опровергает"]
export interface BatchOpIn { op: "set_type" | "remove"; other_type: string; other_id: number; source: "link" | "field"; link_type?: string }
export type BatchAction = { kind: "remove" } | { kind: "set_type"; linkType: string }
export interface BatchRow { key: string; type: string; id: number; title: string; source?: string; stance?: string | null; current?: string | null }
interface Capable { source?: string; capabilities?: string[]; can_edit?: boolean; lock?: { code?: string } | null }

/** Можно ли выбрать связь для пакета; reason — ключ строки интерфейса. Конкурирующие гипотезы в пакет не входят. */
export function batchState(i: Capable): { ok: boolean; reason?: string } {
  if (i.source === "competing") return { ok: false, reason: "relations.batch.competing" }
  const caps = i.capabilities ?? (i.can_edit === false ? [] : ["remove", "set_type"])
  if (caps.includes("remove") && caps.includes("set_type")) return { ok: true }
  const code = i.lock?.code
  return { ok: false, reason: code === "other_author" ? "relations.batch.otherAuthor" : code === "pred_closed" ? "relations.batch.pred_closed" : "relations.batch.noRights" }
}

export const rowCurrent = (i: { source?: string; stance?: string | null; link_type?: string | null }) => linkKey(i)

export function buildOps(rows: BatchRow[], action: BatchAction): BatchOpIn[] {
  return rows.map(r => ({
    op: action.kind, other_type: r.type, other_id: r.id, source: r.source === "field" ? "field" : "link",
    ...(action.kind === "set_type" ? { link_type: action.linkType } : {}),
  }))
}

/** Почему тип связи нельзя поставить выбранным строкам. "field": связь из поля прогноза принимает только «подтверждает»/«опровергает».
 *  "pair": словарь пары записей (lib/link-vocab), бэкенд ответил бы 400. null: можно. selfType не задан: словарь пары не проверяем. */
export function setTypeBlock(rows: BatchRow[], linkType: string, selfType?: string): "field" | "pair" | null {
  if (rows.some(r => r.source === "field") && !FIELD_STANCES.includes(linkType)) return "field"
  if (selfType && rows.some(r => r.source !== "field" && !allowedLinkTypes(selfType, r.type).includes(linkType))) return "pair"
  return null
}

export const canSetType = (rows: BatchRow[], linkType: string, selfType?: string): boolean => setTypeBlock(rows, linkType, selfType) === null
