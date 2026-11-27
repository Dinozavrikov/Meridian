// Кэш интерфейса v3 хранит с переводом отпечаток оригинала (ui-cache.ts). Прежние форматы не знают, с какого
// текста сделан перевод, поэтому не переносятся. У динамического канала ключ и есть оригинал: он остается на v2.
export const uiCacheKey = (locale: string) => `i18n-cache:v3:${locale}`
export const dynCacheKey = (locale: string) => `dyn-i18n-cache:v2:${locale}`
export const legacyUiCacheKeys = (locale: string) => [`i18n-cache:${locale}`, `i18n-cache:v2:${locale}`]
export const legacyDynCacheKey = (locale: string) => `dyn-i18n-cache:${locale}`
export const legacyCacheKeys = (locale: string) => [...legacyUiCacheKeys(locale), legacyDynCacheKey(locale)]
