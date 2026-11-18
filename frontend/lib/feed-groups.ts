import { stripHtml } from "@/lib/strip-html"

// Контракт: backend/app/api/v1/feed.py (FeedGroupOut, FeedGroupsPage). Лента — карточки-группы:
// ядро + прямые соседи (звезда связей), каждая запись ровно в одной карточке.

export interface FeedNote {
  id: number; title: string; preview: string
  author_username: string; author_display: string; created_at: string
}

/** Атрибуция репоста (backend: _attach_repost_info). Заголовок и текст источника есть, только пока источник жив. */
export interface FeedRepostOf {
  source_type: string; source_id: number; source_author: string; comment?: string | null
  source_title?: string; source_preview?: string
}

// Контракт: backend/app/api/v1/feed.py (FeedItem). Индексной сигнатуры нет: поле, которого нет здесь, фронт читать не может.
export interface FeedItem {
  id: number; entity_id: number; type: string; title: string; preview: string
  author_username: string; author_display: string; author_avatar_url?: string | null
  visibility?: string; lab_id?: number | null
  created_at: string; status?: string | null; comment_count?: number
  expected_check_date?: string | null
  repost_source_type?: string | null; repost_source_id?: number | null; repost_of?: FeedRepostOf | null
  note_count?: number; notes?: FeedNote[]
}

export interface FeedRef { type: string; entity_id: number; title: string; translatable?: boolean; author_username?: string }

export interface FeedGroup {
  key: string
  core: FeedItem
  members: { item: FeedItem; relation: string }[]
  internal: { a: FeedRef; b: FeedRef; kind: string }[]
  outside: FeedRef[]
  activity: string
  size: number
  topics: string[]
}

export interface TopicCount { name: string; count: number }

export interface FeedGroupsPage {
  groups: FeedGroup[]
  page: number; page_size: number; total: number; total_pages: number
  type_counts: Record<string, number>
  topics: TopicCount[]
}

export const MEMBERS_COLLAPSED = 4
/** Активность карточки позже создания ядра меньше чем на минуту — отдельную пометку «обновлено» не показываем. */
export const UPDATED_GAP_MS = 60_000

/** Текст без разметки и лишних пробелов (HTML редактора в DOM не попадает). */
export function plain(html: string | null | undefined): string {
  return stripHtml(html ?? "").replace(/\s+/g, " ").trim()
}

/** Карточки всех загруженных страниц без повторов: пока человек листает, карточка может сместиться на соседнюю страницу. */
export function mergeGroups(pages: FeedGroupsPage[]): FeedGroup[] {
  const seen = new Set<string>()
  const out: FeedGroup[] = []
  for (const p of pages) {
    for (const g of p.groups) {
      if (seen.has(g.key)) continue
      seen.add(g.key)
      out.push(g)
    }
  }
  return out
}

/** Сколько участников показать. Прятать одного ради кнопки «ещё 1» бессмысленно: кнопка не меньше самой строки. */
export function splitMembers<T>(members: T[], expanded: boolean, limit = MEMBERS_COLLAPSED): { shown: T[]; hidden: number } {
  if (expanded || members.length <= limit + 1) return { shown: members, hidden: 0 }
  return { shown: members.slice(0, limit), hidden: members.length - limit }
}

export type RelationKind = "confirm" | "refute" | "neutral" | "other"

export function relationKind(relation: string): RelationKind {
  if (relation === "подтверждает") return "confirm"
  if (relation === "опровергает") return "refute"
  if (relation === "" || relation === "связано" || relation === "related") return "neutral"
  return "other"
}

/** Карточка «новая», если в ней была активность после прошлого захода. Первый заход (метки нет) — ничего не новое. */
export function isNewSince(activity: string, lastSeen: string | null): boolean {
  if (!lastSeen) return false
  const a = Date.parse(activity)
  const s = Date.parse(lastSeen)
  return Number.isFinite(a) && Number.isFinite(s) && a > s
}

/** Все записи карточки — твои: метка «Новое» про собственные правки только шумит. */
export function groupIsOnlyMine(g: FeedGroup, username?: string | null): boolean {
  if (!username) return false
  return [g.core, ...g.members.map(m => m.item)].every(i => i.author_username === username)
}

/** Свежее ли то, что вернул «подсмотр» верхней карточки, чем верх загруженного списка. */
export function hasNewerActivity(top: string | null, newest: string | null): boolean {
  if (!newest) return false
  const n = Date.parse(newest)
  if (!Number.isFinite(n)) return false
  if (!top) return true
  const t = Date.parse(top)
  return Number.isFinite(t) && n > t
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">
const SEEN_PREFIX = "meridian.feed.seen."

function defaultStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage } catch { return null }
}

export function readSeen(key: string, storage: StorageLike | null = defaultStorage()): string | null {
  try { return storage?.getItem(SEEN_PREFIX + key) ?? null } catch { return null }
}

export function writeSeen(key: string, iso: string, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(SEEN_PREFIX + key, iso) } catch { /* приватный режим или квота: метка «Новое» просто не сохранится */ }
}

/** Размер первой страницы ленты: один для серверной отрисовки и для клиентского запроса. */
export const FEED_PAGE_SIZE = 20
