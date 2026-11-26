// Данные страницы документации (/docs). Ничего не хранится дважды:
//  - названия и описания видов записей берутся из карты функций (NODE_BY_KEY), стадии из STAGE_VALUES,
//    уровни видимости из VISIBILITY_LEVELS, подписи уровней зрелости из DEFAULT_SCALES;
//  - все числа и формулы читаются из сервиса (GET /meta/maturity-model), в строках они стоят плейсхолдерами;
//  - состав формулы (FORMULA_TERM_IDS) и состав выгрузки (EXPORT_KEYS) сверяются с бэкендом в lib/docs.test.ts.
// Руками здесь остаются порядок разделов и состав карточек: это редакторское решение.
import { membersOf, type NodeKey } from "@/lib/features-map"
import { VISIBILITY_LEVELS } from "@/lib/visibility-levels"

export const SECTIONS = ["start", "records", "maturity", "calibration", "diversity", "stages", "visibility", "safety", "ai", "faq"] as const
export type SectionId = typeof SECTIONS[number]
export const sectionTitleKey = (id: SectionId) => `docsPage.section.${id}.title`
export const sectionLeadKey = (id: SectionId) => `docsPage.section.${id}.lead`

export const STEP_IDS = ["observe", "hypothesize", "predict", "close"] as const
export type StepId = typeof STEP_IDS[number]
export const STEP_NODE: Record<StepId, NodeKey> = {
  observe: "observation", hypothesize: "hypothesis", predict: "prediction", close: "calibration",
}
export const stepKeys = (id: StepId) => ({ title: `docsPage.step.${id}.title`, text: `docsPage.step.${id}.text` })

export const RECORD_KEYS = membersOf("records")
export const recordRoleKey = (k: NodeKey) => `docsPage.record.${k}.role`

export const PRINCIPLES = ["surprise", "miss", "risk"] as const
export const FORMULA_TERM_IDS = ["predictions", "observations", "lab", "skill", "risk"] as const

export interface CardSpec { id: string; plural?: boolean; example?: boolean }
export const CALIBRATION_CARDS: readonly CardSpec[] = [{ id: "what" }, { id: "how" }, { id: "scopes" }, { id: "tags", plural: true }, { id: "deletion" }]
export const DIVERSITY_CARDS: readonly CardSpec[] = [{ id: "what", example: true }, { id: "similarity" }, { id: "confirm" }, { id: "refute" }, { id: "effect", example: true }]
export const VISIBILITY_CARDS: readonly CardSpec[] = [{ id: "labs" }, { id: "snapshots" }]
export const SAFETY_CARDS: readonly CardSpec[] = [{ id: "history" }, { id: "trash" }, { id: "export" }, { id: "account" }]
export const AI_CARDS: readonly CardSpec[] = [{ id: "where" }, { id: "reads" }, { id: "limits" }]
export const CARD_GROUPS: readonly { ns: string; cards: readonly CardSpec[] }[] = [
  { ns: "calibration", cards: CALIBRATION_CARDS }, { ns: "diversity", cards: DIVERSITY_CARDS },
  { ns: "visibility", cards: VISIBILITY_CARDS }, { ns: "safety", cards: SAFETY_CARDS }, { ns: "ai", cards: AI_CARDS },
]

/** От личного к публичному: так удобнее читать. */
export const VISIBILITY_ORDER = [...VISIBILITY_LEVELS].reverse().map(l => l.value)

/** Что входит в выгрузку (ключи GET /me/export, кроме служебных). Сверяется с бэкендом тестом. */
export const EXPORT_KEYS = ["hypotheses", "observations", "predictions", "worldview", "questions", "tasks", "links", "tags", "scale_defs", "scale_values"] as const

export const FAQ_IDS = ["diary", "audience", "start", "hypothesis", "confidence", "missed", "slow", "manual", "weights", "diversity",
  "who", "delete", "undo", "export", "account", "lab", "labsignal", "ai"] as const
export type FaqId = typeof FAQ_IDS[number]
export const faqKeys = (id: FaqId) => ({ q: `docsPage.faq.item.${id}.q`, a: `docsPage.faq.item.${id}.a` })

/** Плейсхолдеры, которые подставляет страница: числа из модели и значения из места вызова. */
export const MODEL_VARS = ["k", "floor", "neutral", "dflt", "cfloor", "cceil", "partial", "imp", "w", "maxObs", "scale", "rmax", "maxMult",
  "lmax", "thr", "t1", "chi", "clo", "vhi", "vlo", "vmiss", "sim", "cmin", "rmin", "narrow"] as const
export const CALL_VARS = ["n", "r", "level", "items"] as const

/** Пространства ключей, которые целиком выводятся из данных выше: лишний или недостающий ключ ловит тест. */
export const DATA_PREFIXES = ["docsPage.section.", "docsPage.step.", "docsPage.record.", "docsPage.principle.", "docsPage.formula.term.",
  "docsPage.calibration.", "docsPage.diversity.", "docsPage.visibility.", "docsPage.safety.", "docsPage.ai.", "docsPage.export.item.", "docsPage.faq.item."]

export const textKeys = (base: string, plural: boolean) =>
  plural ? ["One", "Few", "Many"].map(f => `${base}.text${f}`) : [`${base}.text`]

export function docsDataKeys(): string[] {
  const keys: string[] = []
  for (const id of SECTIONS) keys.push(sectionTitleKey(id), sectionLeadKey(id))
  for (const id of STEP_IDS) keys.push(...Object.values(stepKeys(id)))
  for (const k of RECORD_KEYS) keys.push(recordRoleKey(k))
  for (const id of PRINCIPLES) keys.push(`docsPage.principle.${id}.title`, `docsPage.principle.${id}.text`)
  for (const id of FORMULA_TERM_IDS) for (const f of ["name", "eq", "text"]) keys.push(`docsPage.formula.term.${id}.${f}`)
  for (const g of CARD_GROUPS) for (const c of g.cards) keys.push(`docsPage.${g.ns}.${c.id}.title`, ...textKeys(`docsPage.${g.ns}.${c.id}`, !!c.plural))
  for (const g of CARD_GROUPS) for (const c of g.cards) if (c.example) keys.push(`docsPage.${g.ns}.${c.id}.example`)
  for (const l of VISIBILITY_LEVELS) keys.push(`docsPage.visibility.level.${l.value}.text`)
  for (const e of EXPORT_KEYS) keys.push(`docsPage.export.item.${e}`)
  for (const id of FAQ_IDS) keys.push(...Object.values(faqKeys(id)))
  return keys
}
