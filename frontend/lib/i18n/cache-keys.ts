// v2: до 20.09 сервер при сбое перевода возвращал русские оригиналы как «перевод», а клиент
// сохранял их в localStorage — строка навсегда оставалась русской (жёсткая перезагрузка не
// помогала). Новая версия ключа одним махом отбрасывает отравленные кэши; старые ключи
// удаляются при загрузке переводов (см. useTranslationsLoader).
export const uiCacheKey = (locale: string) => `i18n-cache:v2:${locale}`
export const dynCacheKey = (locale: string) => `dyn-i18n-cache:v2:${locale}`
export const legacyCacheKeys = (locale: string) => [`i18n-cache:${locale}`, `dyn-i18n-cache:${locale}`]
