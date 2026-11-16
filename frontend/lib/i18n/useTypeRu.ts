"use client"
import { useT } from "@/lib/i18n/useT"

/**
 * Переведённая версия typeRu (lib/theme.ts) — та же форма (Record<string,string>
 * с теми же ключами: hypothesis/observation/prediction/worldview/question/
 * task/lab), но значения переведены через t(). Возвращаемый объект называется
 * так же, как исходный импорт (typeRu), чтобы во всех местах использования
 * (typeRu[x]) не менять ничего, кроме способа его получения.
 */
export function useTypeRu(): Record<string, string> {
  const t = useT()
  return {
    hypothesis:  t("entityType.hypothesis"),
    observation: t("entityType.observation"),
    prediction:  t("entityType.prediction"),
    worldview:   t("entityType.worldview"),
    question:    t("entityType.question"),
    task:        t("entityType.task"),
    lab:         t("entityType.lab"),
  }
}
