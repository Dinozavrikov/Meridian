import { dynCacheKey, legacyDynCacheKey, legacyUiCacheKeys } from "./cache-keys"
import { dropUntranslated, type Dict } from "./chunked-loader"

function readDict(raw: string | null): Dict | null {
  if (!raw || raw === "undefined") return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Dict) : null
  } catch {
    return null
  }
}

/** Старые кэши интерфейса удаляются без переноса: неизвестно, с какого текста сделаны переводы.
 * Хорошие переводы динамического канала (ключ там и есть оригинал) переносятся в v2, пустые и непереведенные нет. */
export function migrateLegacyCaches(locale: string, storage: Storage = localStorage): void {
  for (const key of legacyUiCacheKeys(locale)) storage.removeItem(key)

  const legacyDyn = legacyDynCacheKey(locale)
  const dyn = readDict(storage.getItem(legacyDyn))
  if (dyn && storage.getItem(dynCacheKey(locale)) === null) {
    const selfSource = Object.fromEntries(Object.keys(dyn).map(k => [k, k]))
    storage.setItem(dynCacheKey(locale), JSON.stringify(dropUntranslated(dyn, selfSource)))
  }
  storage.removeItem(legacyDyn)
}
