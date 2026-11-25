// Главная страница: списки и ключи текстов. Тексты лежат в lib/i18n/strings.ts (sitePage.home.*), числа и списки
// берутся из единых источников в коде (типы записей, стадии, уровни видимости, влияния на убеждения, модель зрелости).
import { VISIBILITY_LEVELS } from "@/lib/visibility-levels"
import { SANDBOX_DATA_KEYS } from "@/lib/site/sandbox"

export const HOME_KEYS = {
  eyebrow: "footer.tagline",
  title: "sitePage.home.title",
  lead: "sitePage.home.lead",
  ctaRegister: "sitePage.home.cta.register",
  ctaLogin: "sitePage.home.cta.login",
  ctaApp: "sitePage.home.cta.app",
  ctaSandbox: "sitePage.home.cta.sandbox",
  privacy: "sitePage.home.privacy",
} as const

export const PASSPORT_KEYS = {
  label: "sitePage.home.passport.label",
  example: "sitePage.home.passport.example",
  idea: "sitePage.home.passport.idea",
  maturity: "sitePage.home.passport.maturity",
  level: "sitePage.home.passport.level",
  support: "sitePage.home.passport.support",
  supportText: "sitePage.home.passport.supportText",
  blind: "sitePage.home.passport.blind",
  blindText: "sitePage.home.passport.blindText",
  forecast: "sitePage.home.passport.forecast",
  forecastText: "sitePage.home.passport.forecastText",
  confidence: "sitePage.home.passport.confidence",
  note: "sitePage.home.passport.note",
} as const

/** Значения придуманного примера на карточке (на ней стоит пометка «пример»). Уровень не выше верхней границы модели зрелости. */
export const EXAMPLE = { level: 2, confidence: 70 } as const

export const SECTION_KEYS = {
  sandbox: { title: "sitePage.home.sandbox.title", lead: "sitePage.home.sandbox.lead" },
  steps: { title: "sitePage.home.steps.title", lead: "sitePage.home.steps.lead" },
  computes: { title: "sitePage.home.computes.title", lead: "sitePage.home.computes.lead" },
  records: { title: "sitePage.home.records.title", lead: "sitePage.home.records.lead" },
  audience: { title: "sitePage.home.audience.title", lead: "sitePage.home.audience.lead" },
  data: { title: "sitePage.home.data.title", lead: "sitePage.home.data.lead" },
  final: { title: "sitePage.home.final.title", lead: "sitePage.home.final.lead" },
} as const

export const STEP_IDS = ["observe", "hypothesize", "predict", "close"] as const
export type StepId = (typeof STEP_IDS)[number]
/** Тип записи, чьим цветом помечен шаг (цвета лежат в TYPE_COLORS). */
export const STEP_TYPE: Record<StepId, string> = {
  observe: "observation", hypothesize: "hypothesis", predict: "prediction", close: "prediction",
}
export const stepKeys = (id: StepId) => ({ title: `sitePage.home.step.${id}.title`, text: `sitePage.home.step.${id}.text` })

export const COMPUTE_IDS = ["maturity", "independence", "blind", "calibration", "contradictions", "patterns"] as const
export type ComputeId = (typeof COMPUTE_IDS)[number]
export const computeKeys = (id: ComputeId) => ({ title: `sitePage.home.compute.${id}.title`, text: `sitePage.home.compute.${id}.text` })
/** Заголовок карточки зрелости, пока границы шкалы едут с сервера: без чисел. */
export const MATURITY_PENDING_KEY = "sitePage.home.compute.maturity.titlePending"

/** Основы ключей с формами числа (One, Few, Many): форму выбирает pluralKey по правилам русского языка. */
export const COUNT_BASES = {
  records: "sitePage.home.records.count",
  stages: "sitePage.home.stages.count",
  visibility: "sitePage.home.vis.count",
} as const
export const visKey = (value: string) => `sitePage.home.vis.${value}`

export const RECORDS_KEYS = {
  influence: "sitePage.home.records.influence",
  stagesText: "sitePage.home.stages.text",
  visText: "sitePage.home.vis.text",
  labNote: "sitePage.home.records.labNote",
} as const

export const AUDIENCE_KEYS = {
  decideTitle: "sitePage.home.audience.decide.title",
  decideText: "sitePage.home.audience.decide.text",
  decideExtra: "sitePage.home.audience.decide.extra",
  researchTitle: "sitePage.home.audience.research.title",
  researchText: "sitePage.home.audience.research.text",
  note: "sitePage.home.audience.note",
} as const

export const DATA_ITEM_IDS = ["records", "consent", "trackers", "passwords", "history"] as const
export const dataItemKey = (id: (typeof DATA_ITEM_IDS)[number]) => `sitePage.home.data.item.${id}`
export const DATA_LINK_KEY = "sitePage.home.data.link"

export const FINAL_KEYS = { docs: "sitePage.home.final.docs" } as const

const FORMS = ["One", "Few", "Many"] as const

/** Все ключи, которые обязаны существовать для данных этого файла. */
export const DATA_KEYS: string[] = [
  ...Object.values(HOME_KEYS),
  ...Object.values(PASSPORT_KEYS),
  ...Object.values(RECORDS_KEYS),
  ...Object.values(AUDIENCE_KEYS),
  ...Object.values(FINAL_KEYS),
  ...SANDBOX_DATA_KEYS,
  ...Object.values(SECTION_KEYS).flatMap(k => [k.title, k.lead]),
  ...STEP_IDS.flatMap(id => Object.values(stepKeys(id))),
  ...COMPUTE_IDS.flatMap(id => Object.values(computeKeys(id))),
  MATURITY_PENDING_KEY,
  DATA_LINK_KEY,
  ...DATA_ITEM_IDS.map(dataItemKey),
  ...Object.values(COUNT_BASES).flatMap(base => FORMS.map(f => `${base}${f}`)),
  ...VISIBILITY_LEVELS.map(l => visKey(l.value)),
]
