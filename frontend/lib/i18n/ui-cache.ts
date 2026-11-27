import { dropUntranslated, type Dict } from "./chunked-loader"

// Кэш переводов интерфейса в localStorage. Рядом с переводом лежит отпечаток русского оригинала:
// если текст под тем же ключом изменился, старый перевод не показывается, даже когда сервер молчит.
type Entry = { h: string; t: string }

/** FNV-1a, 32 бита: нужен только чтобы заметить изменение оригинала, это не защита. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

export function packUiCache(translations: Dict, source: Dict): Record<string, Entry> {
  const out: Record<string, Entry> = {}
  for (const [key, t] of Object.entries(translations)) {
    if (Object.hasOwn(source, key)) out[key] = { h: fingerprint(source[key]), t }
  }
  return out
}

/** Только переводы, сделанные с нынешнего оригинала. Битый или чужой формат дает пустой словарь. */
export function readUiCache(raw: string | null, source: Dict): Dict {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? "null")
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object") return {}
  const out: Dict = {}
  for (const [key, entry] of Object.entries(parsed as Record<string, Partial<Entry> | null>)) {
    if (!Object.hasOwn(source, key) || !entry || typeof entry.t !== "string") continue
    if (entry.h !== fingerprint(source[key])) continue
    out[key] = entry.t
  }
  return dropUntranslated(out, source)
}
