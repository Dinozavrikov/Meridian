// Страница приватности: единый список разделов, таблиц и карточек. Тексты лежат в lib/i18n/strings.ts (privacyPage.*),
// а сроки приходят с сервера (/meta/privacy-facts), поэтому текст не может разойтись с настройками.
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { pluralKey } from "@/lib/i18n/ru-plural"

export const PRIVACY_REVISION = { version: "2.0", date: "2026-11-15" } as const

export const SECTIONS = ["summary", "data", "storage", "partners", "deletion", "contact"] as const
export type SectionId = (typeof SECTIONS)[number]
export const PROMISE_IDS = ["analytics", "records", "ai", "control"] as const
export const DATA_ROW_IDS = ["email", "password", "profile", "records", "login", "logs"] as const
export const COOKIE_PURPOSES = ["access", "refresh", "oauth_state"] as const
export const PARTNER_IDS = ["mail", "google", "video", "hosting"] as const
export const DELETION_IDS = ["trash", "snapshots", "account", "backups", "export", "rights", "security"] as const

export const sectionTitleKey = (id: SectionId) => `privacyPage.section.${id}.title`
export const sectionLeadKey = (id: SectionId) => `privacyPage.section.${id}.lead`
export const promiseKeys = (id: string) => ({ title: `privacyPage.promise.${id}.title`, text: `privacyPage.promise.${id}.text` })
export const dataRowKeys = (id: string) => ({ what: `privacyPage.data.row.${id}.what`, why: `privacyPage.data.row.${id}.why`, term: `privacyPage.data.row.${id}.term` })
export const partnerKeys = (id: string) => ({ title: `privacyPage.partner.${id}.title`, text: `privacyPage.partner.${id}.text` })
export const deletionKeys = (id: string) => ({ title: `privacyPage.deletion.${id}.title`, text: `privacyPage.deletion.${id}.text` })
export const purposeKey = (purpose: string) => `privacyPage.storage.purpose.${purpose}`

/** Все ключи, которые обязаны существовать для данных этого файла. */
export const DATA_KEYS: string[] = [
  ...SECTIONS.flatMap(id => [sectionTitleKey(id), sectionLeadKey(id)]),
  ...PROMISE_IDS.flatMap(id => Object.values(promiseKeys(id))),
  ...DATA_ROW_IDS.flatMap(id => Object.values(dataRowKeys(id))),
  ...COOKIE_PURPOSES.map(purposeKey),
  ...PARTNER_IDS.flatMap(id => Object.values(partnerKeys(id))),
  ...DELETION_IDS.flatMap(id => Object.values(deletionKeys(id))),
]
/** Префиксы, под которыми лежат только данные из списков выше (лишних строк там быть не должно). */
export const DATA_PREFIXES = ["privacyPage.section.", "privacyPage.promise.", "privacyPage.data.row.", "privacyPage.storage.purpose.", "privacyPage.partner.", "privacyPage.deletion."]
export const CALL_VARS = ["n", "version", "date", "email", "refreshTtl", "resetTtl"]

export interface PrivacyFacts {
  session: { access_minutes: number; refresh_days: number }
  reset_link_minutes: number
  google_state_minutes: number
  cookies: { name: string; purpose: string; ttl_seconds: number }[]
}

export const privacyApi = {
  get: () => api.get<PrivacyFacts>("/api/v1/meta/privacy-facts").then(r => r.data),
}
export const usePrivacyFacts = () => useQuery({ queryKey: ["privacy-facts"], queryFn: privacyApi.get, staleTime: 5 * 60 * 1000 })

type TFn = (key: string, vars?: Record<string, string | number>) => string

/** Срок в самой крупной единице, в которую он делится нацело (секунды округляются вверх до минут). */
export function ttlUnit(seconds: number): { unit: "day" | "hour" | "minute"; n: number } {
  if (seconds > 0 && seconds % 86400 === 0) return { unit: "day", n: seconds / 86400 }
  if (seconds > 0 && seconds % 3600 === 0) return { unit: "hour", n: seconds / 3600 }
  return { unit: "minute", n: Math.max(1, Math.ceil(seconds / 60)) }
}

/** «15 минут», «1 минута», «30 дней»: форма слова по числу (см. pluralKey), без ручной склейки. */
export function formatTtl(t: TFn, seconds: number): string {
  const { unit, n } = ttlUnit(seconds)
  return t(pluralKey(`privacyPage.unit.${unit}`, n), { n })
}
