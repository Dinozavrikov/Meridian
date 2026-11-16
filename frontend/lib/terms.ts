// Страница условий: единый список разделов и карточек. Тексты лежат в lib/i18n/strings.ts (termsPage.*).
export const TERMS_REVISION = { version: "2.0", date: "2026-11-15" } as const

export const SECTIONS = ["summary", "account", "rules", "content", "service", "ending", "contact"] as const
export type SectionId = (typeof SECTIONS)[number]

/** Карточки по разделам: ключ группы совпадает с id раздела (кроме contact, у него своя вёрстка). */
export const CARD_GROUPS = {
  summary: ["short", "records", "evolving", "tool"],
  account: ["email", "credentials", "notify"],
  rules: ["law", "access", "malware", "copying", "bots", "rights"],
  content: ["own", "visibility", "copies", "responsibility", "export"],
  service: ["asis", "changes", "advice", "backups", "ip"],
  ending: ["leave", "suspend", "changes"],
} as const
export type CardGroup = keyof typeof CARD_GROUPS

export const sectionTitleKey = (id: SectionId) => `termsPage.section.${id}.title`
export const sectionLeadKey = (id: SectionId) => `termsPage.section.${id}.lead`
export const cardKeys = (group: CardGroup, id: string) => ({ title: `termsPage.${group}.${id}.title`, text: `termsPage.${group}.${id}.text` })

const GROUPS = Object.keys(CARD_GROUPS) as CardGroup[]
/** Все ключи, которые обязаны существовать для данных этого файла. */
export const DATA_KEYS: string[] = [
  ...SECTIONS.flatMap(id => [sectionTitleKey(id), sectionLeadKey(id)]),
  ...GROUPS.flatMap(g => CARD_GROUPS[g].flatMap(id => Object.values(cardKeys(g, id)))),
]
/** Префиксы, под которыми лежат только данные из списков выше (лишних строк там быть не должно). */
export const DATA_PREFIXES = ["termsPage.section.", ...GROUPS.map(g => `termsPage.${g}.`)]
export const CALL_VARS = ["email"]
