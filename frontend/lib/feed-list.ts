import { evidenceBalance, type Balance } from "@/lib/feed-dossier"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

// Модель строки режима «Список». Как и в карточке, всё считается по ВИДИМЫМ участникам группы.

export type EvidenceCell =
  | { kind: "balance"; balance: Balance }   // гипотеза с участниками: подтверждают / опровергают / прочие
  | { kind: "links"; n: number }            // другие типы с участниками: только число связей
  | { kind: "none" }                        // участников нет: прочерк

export function evidenceCell(group: FeedGroup): EvidenceCell {
  if (group.members.length === 0) return { kind: "none" }
  if (group.core.type === "hypothesis") return { kind: "balance", balance: evidenceBalance(group.members) }
  return { kind: "links", n: group.members.length }
}

/** Страница дискуссии записи; у репоста — дискуссия источника. */
export function discussionHref(core: FeedItem): string {
  const type = (core.repost_source_type as string | undefined) ?? core.type
  const id = (core.repost_source_id as number | undefined) ?? core.entity_id
  return `/feed/discussion/${type}/${id}`
}


/** Что показать слева в строке списка: баланс доказательств у гипотезы (подтверждают и опровергают — balance, одни
 *  связи без оценки — related, ничего — none), у остальных типов статус с иконкой (status). */
export type VerdictKind = "balance" | "related" | "none" | "status"

export function verdictKind(group: FeedGroup): VerdictKind {
  if (group.core.type !== "hypothesis") return "status"
  const cell = evidenceCell(group)
  if (cell.kind !== "balance") return "none"
  return cell.balance.confirm + cell.balance.refute > 0 ? "balance" : "related"
}

export type VerdictIcon = "check" | "partial" | "x" | "clock" | "eye" | "help" | "task" | "worldview" | "bulb"

export function verdictIcon(type: string, status?: string | null): VerdictIcon {
  if (type === "prediction") {
    if (status === "подтвердился") return "check"
    if (status === "частично подтвердился") return "partial"
    if (status === "не подтвердился") return "x"
    return "clock"
  }
  if (type === "observation") return "eye"
  if (type === "question") return "help"
  if (type === "task") return "task"
  if (type === "worldview") return "worldview"
  return "bulb"
}
