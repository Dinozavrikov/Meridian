// Песочница «проверь свою идею» на главной: пробелы, ключи текстов и чистые функции разбора.
// Все считается в браузере: ничего не отправляется и не сохраняется. Тексты лежат в lib/i18n/strings.ts (раздел sitePage.home.sandbox).

/** Якорь раздела: на него ведет кнопка первого экрана. */
export const SANDBOX_ID = "sandbox"

/** Поля, которые считаются пробелами, пока не заполнены. Число «заполнено из N» берется из длины этого списка. */
export const GAP_IDS = ["source", "refutation", "deadline"] as const
export type GapId = (typeof GAP_IDS)[number]
export const gapKeys = (id: GapId) => ({
  label: `sitePage.home.sandbox.gap.${id}.label`,
  question: `sitePage.home.sandbox.gap.${id}.question`,
  note: `sitePage.home.sandbox.gap.${id}.note`,
})

export const gapExampleKey = (id: GapId) => (id === "source" ? `sitePage.home.sandbox.gap.${id}.example` : null)

export const SANDBOX_KEYS = {
  claimLabel: "sitePage.home.sandbox.claim.label",
  claimPlaceholder: "sitePage.home.sandbox.claim.placeholder",
  confidenceLabel: "sitePage.home.sandbox.confidence.label",
  confidenceIdle: "sitePage.home.sandbox.confidence.idle",
  confidenceValue: "sitePage.home.sandbox.confidence.value",
  confidenceHelp: "sitePage.home.sandbox.confidence.help",
  edgeLow: "sitePage.home.sandbox.edge.low",
  edgeHigh: "sitePage.home.sandbox.edge.high",
  sourceLabel: "sitePage.home.sandbox.source.label",
  sourcePlaceholder: "sitePage.home.sandbox.source.placeholder",
  refutationLabel: "sitePage.home.sandbox.refutation.label",
  refutationPlaceholder: "sitePage.home.sandbox.refutation.placeholder",
  deadlineLabel: "sitePage.home.sandbox.deadline.label",
  resultTitle: "sitePage.home.sandbox.result.title",
  progress: "sitePage.home.sandbox.progress",
  claimFirst: "sitePage.home.sandbox.claimFirst",
  allFilled: "sitePage.home.sandbox.allFilled",
  gapsTitle: "sitePage.home.sandbox.gapsTitle",
  explain: "sitePage.home.sandbox.explain",
  download: "sitePage.home.sandbox.download",
  copy: "sitePage.home.sandbox.copy",
  copied: "sitePage.home.sandbox.copied",
  copyFailed: "sitePage.home.sandbox.copyFailed",
  privacy: "sitePage.home.sandbox.privacy",
  mdTitle: "sitePage.home.sandbox.md.title",
  mdClaim: "sitePage.home.sandbox.md.claim",
  mdConfidence: "sitePage.home.sandbox.md.confidence",
  mdSource: "sitePage.home.sandbox.md.source",
  mdRefutation: "sitePage.home.sandbox.md.refutation",
  mdDeadline: "sitePage.home.sandbox.md.deadline",
  mdMissing: "sitePage.home.sandbox.md.missing",
  mdNone: "sitePage.home.sandbox.md.none",
  mdNothingMissing: "sitePage.home.sandbox.md.nothingMissing",
  mdExported: "sitePage.home.sandbox.md.exported",
} as const

/** Все ключи, которые обязаны иметь тексты (подключается к DATA_KEYS в lib/site/home.ts). */
export const SANDBOX_DATA_KEYS: string[] = [
  ...Object.values(SANDBOX_KEYS),
  ...GAP_IDS.flatMap(id => Object.values(gapKeys(id))),
  ...GAP_IDS.map(gapExampleKey).filter((k): k is string => k !== null),
]

export interface SandboxDraft {
  claim: string
  /** null, пока человек не тронул ползунок: тогда в файл уверенность не попадает. */
  confidence: number | null
  source: string
  refutation: string
  /** Значение поля даты: ГГГГ-ММ-ДД или пустая строка. */
  deadline: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Настоящая дата в формате ГГГГ-ММ-ДД: 2026-02-31 не проходит. */
export function isRealDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** Незаполненные поля в порядке списка. Поле засчитано, если в нем есть не только пробелы, а срок это настоящая дата. */
export function missingGaps(d: SandboxDraft): GapId[] {
  return GAP_IDS.filter(id => (id === "deadline" ? !isRealDate(d.deadline) : d[id].trim() === ""))
}

export interface ConfidenceBounds { min: number; max: number; initial: number }
type ModelLike = { prediction?: { confidence_floor_pct?: unknown; confidence_ceil_pct?: unknown; default_confidence?: unknown } }
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x)

/** Границы и начальное положение ползунка из модели на сервере. Неполная или противоречивая модель дает null. */
export function confidenceBounds(model: ModelLike | null | undefined): ConfidenceBounds | null {
  const p = model?.prediction
  const min = p?.confidence_floor_pct, max = p?.confidence_ceil_pct, def = p?.default_confidence
  if (!isNum(min) || !isNum(max) || !isNum(def) || min >= max) return null
  return { min, max, initial: Math.min(max, Math.max(min, def)) }
}

export type Edge = "low" | "high" | null
/** Край шкалы: сама граница уже считается краем. */
export function edgeOf(confidence: number | null, bounds: { min: number; max: number } | null): Edge {
  if (confidence === null || !bounds) return null
  if (confidence <= bounds.min) return "low"
  if (confidence >= bounds.max) return "high"
  return null
}

const two = (n: number) => String(n).padStart(2, "0")
/** Местная дата ГГГГ-ММ-ДД. toISOString дал бы дату по UTC: в часовых поясах восточнее ночью это вчерашняя дата. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}
export const exportFileName = (d: Date) => `idea-check-${localDate(d)}.md`

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/** Markdown-файл с введенным и списком незаполненного. Многострочный текст не разбирается, а кладется под заголовок как есть. */
export function buildMarkdown(d: SandboxDraft, t: Translate, now: Date): string {
  const K = SANDBOX_KEYS
  const none = t(K.mdNone)
  const text = (s: string) => (s.trim() === "" ? none : s.trim())
  const missing = missingGaps(d)
  const parts: string[] = [`# ${t(K.mdTitle)}`]
  const section = (title: string, body: string) => { parts.push(`## ${title}\n\n${body}`) }
  section(t(K.mdClaim), text(d.claim))
  if (d.confidence !== null) section(t(K.mdConfidence), t(K.confidenceValue, { pct: d.confidence }))
  section(t(K.mdSource), text(d.source))
  section(t(K.mdRefutation), text(d.refutation))
  section(t(K.mdDeadline), isRealDate(d.deadline) ? d.deadline : none)
  section(
    t(K.mdMissing),
    missing.length === 0
      ? t(K.mdNothingMissing)
      : missing.map(id => { const g = gapKeys(id); return `- ${t(g.label)}: ${t(g.question)}` }).join("\n"),
  )
  parts.push(`---\n${t(K.mdExported, { date: localDate(now) })}`)
  return parts.join("\n\n") + "\n"
}
