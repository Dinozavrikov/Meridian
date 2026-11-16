// Дорожная карта: единый источник данных. Тексты лежат в lib/i18n/strings.ts (roadmapPage.*),
// а здесь только структура: что, в каком порядке и на какой стадии.
import { STAGE_VALUES, type StageValue } from "@/lib/stage-labels"
import type { NodeKey } from "@/lib/features-map"

export interface RoadmapEntry { key: string; stage: StageValue }

/** Сквозной вопрос автора. Стадия: пока изучаю. */
export const AUTHOR_QUESTION: RoadmapEntry = { key: "physical", stage: "research" }
/** Главный вопрос текущего этапа. */
export const CURRENT: RoadmapEntry = { key: "audience", stage: "experiments" }
/** Порядок важен: каждый следующий шаг опирается на предыдущий. Сроков нет намеренно. */
export const NEXT_STEPS: readonly RoadmapEntry[] = [
  { key: "labManagement", stage: "prototype" },
  { key: "fork", stage: "research" },
  { key: "merge", stage: "question" },
]
/** Видение. Строится на форке и слиянии, поэтому не может быть зрелее их (проверяет тест). */
export const VISION: RoadmapEntry = { key: "federation", stage: "question" }
export const ENTRIES: readonly RoadmapEntry[] = [AUTHOR_QUESTION, CURRENT, ...NEXT_STEPS, VISION]

/** ИИ-функции, которые видит пользователь. Названия и описания: roadmapPage.ai.<ключ>.name|text */
export const AI_ABILITIES = [
  "contradictions", "translation", "images", "factInterpretation", "answers", "suggestions", "reflection", "patterns", "sources",
] as const

/** Узел карты функций, на котором строятся форк и слияние. */
export const FOUNDATION_NODE: NodeKey = "snapshots"

export const stageIndex = (s: StageValue): number => STAGE_VALUES.indexOf(s)
export const pad2 = (n: number): string => String(n).padStart(2, "0")
