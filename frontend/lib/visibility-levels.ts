// frontend/lib/visibility-levels.ts
//
// Общие структурные данные о трёх "кольцах" видимости — вынесены из
// orbit-selector.tsx, чтобы переиспользовать в новом VisibilityTabs
// (списковые страницы) без завязки на попап/inline режимы OrbitSelector,
// которые остаются для других мест (например profile-шапка).
import { Lock, FlaskConical, Globe } from "lucide-react"

export const VISIBILITY_LEVELS = [
  { value: "public",  icon: Globe,        color: "#27AE60" },
  { value: "lab",     icon: FlaskConical, color: "#4A90D9" },
  { value: "private", icon: Lock,         color: "#9999a6" },
] as const

export type VisibilityValue = typeof VISIBILITY_LEVELS[number]["value"]

// Единый источник данных для чипа видимости в детальном просмотре сущности
// (EntityActionsBar/visibilityNode) — раньше каждая страница (hypotheses,
// tasks) держала свою локальную копию getVisOpts с дублирующимися лейблами
// и иконками. labColor опционален — на некоторых страницах "лаборатория"
// красится в акцентный цвет самой страницы, а не в фиксированный #4A90D9.
export function getVisibilityOptions(
  t: (key: string) => string,
  labColor?: string,
) {
  return [
    { value: "private" as const, label: t("visibility.private"), icon: Lock,         color: "#9999a6" },
    { value: "lab" as const,     label: t("visibility.lab"),      icon: FlaskConical, color: labColor ?? "#4A90D9" },
    { value: "public" as const,  label: t("visibility.public"),   icon: Globe,        color: "#27AE60" },
  ]
}
