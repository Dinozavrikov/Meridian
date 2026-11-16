import { resolveMediaUrl } from "@/lib/api"
import { entityHref, type EntityType } from "@/lib/entity-routes"
import { ENTITY_TYPE_ORDER } from "@/lib/lab-checkpoints-view"
import type { LabFile } from "@/lib/lab-files-api"

const KNOWN = new Set<string>(ENTITY_TYPE_ORDER)

/** Ссылка на вкладку «Файлы» записи (на страницах записей идентификатор этой вкладки остаётся "images"). */
export function entityFilesHref(f: Pick<LabFile, "entity_type" | "entity_id">): string | null {
  return KNOWN.has(f.entity_type) ? entityHref(f.entity_type as EntityType, f.entity_id, { tab: "images" }) : null
}

export const fileHref = (f: LabFile): string | null => resolveMediaUrl(f.download_url ?? f.url)
export const thumbSrc = (f: LabFile): string | null => resolveMediaUrl(f.thumb_url)

export interface FileFilter { type: string; query: string }

export function filterLabFiles(items: LabFile[], { type, query }: FileFilter): LabFile[] {
  const q = query.trim().toLowerCase()
  return items.filter(f =>
    (type === "all" || f.entity_type === type) &&
    (!q || f.name.toLowerCase().includes(q) || f.entity_title.toLowerCase().includes(q)),
  )
}

/** Сколько файлов у каждого типа записи: известные типы в привычном порядке, неизвестные в конце по алфавиту. */
export function typeCounts(items: LabFile[]): [string, number][] {
  const c = new Map<string, number>()
  for (const f of items) c.set(f.entity_type, (c.get(f.entity_type) ?? 0) + 1)
  const known = ENTITY_TYPE_ORDER.filter(t => c.has(t)).map(t => [t, c.get(t) as number] as [string, number])
  const rest = [...c.keys()].filter(t => !KNOWN.has(t)).sort().map(t => [t, c.get(t) as number] as [string, number])
  return [...known, ...rest]
}

export interface FileGroup { key: string; entity_type: string; entity_id: number; entity_title: string; files: LabFile[] }

/** Файлы по записям. Вход уже отсортирован от новых к старым: группа встаёт на место своего самого свежего файла. */
export function groupByEntity(items: LabFile[]): FileGroup[] {
  const groups = new Map<string, FileGroup>()
  for (const f of items) {
    const key = `${f.entity_type}:${f.entity_id}`
    let g = groups.get(key)
    if (!g) {
      g = { key, entity_type: f.entity_type, entity_id: f.entity_id, entity_title: f.entity_title, files: [] }
      groups.set(key, g)
    }
    g.files.push(f)
  }
  return [...groups.values()]
}
