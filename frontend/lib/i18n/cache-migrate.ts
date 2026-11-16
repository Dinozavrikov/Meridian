import { uiCacheKey, dynCacheKey, legacyCacheKeys } from "./cache-keys"
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

/** Переносит хорошие переводы из кэша прежнего формата (без версии) в v2, а «отравленные» —
 * пустые и русский оригинал, выданный за перевод, — отбрасывает; старые ключи удаляются.
 * Так пользователи не теряют готовые переводы, а плохие записи не переезжают.
 * uiSource — словарь оригиналов UI-строк (STRINGS); у динамического канала ключ и есть оригинал. */
export function migrateLegacyCaches(locale: string, uiSource: Dict, storage: Storage = localStorage): void {
  const [legacyUi, legacyDyn] = legacyCacheKeys(locale)

  const ui = readDict(storage.getItem(legacyUi))
  if (ui && storage.getItem(uiCacheKey(locale)) === null) {
    storage.setItem(uiCacheKey(locale), JSON.stringify(dropUntranslated(ui, uiSource)))
  }

  const dyn = readDict(storage.getItem(legacyDyn))
  if (dyn && storage.getItem(dynCacheKey(locale)) === null) {
    const selfSource = Object.fromEntries(Object.keys(dyn).map(k => [k, k]))
    storage.setItem(dynCacheKey(locale), JSON.stringify(dropUntranslated(dyn, selfSource)))
  }

  storage.removeItem(legacyUi)
  storage.removeItem(legacyDyn)
}
