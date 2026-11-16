import type { QueryClient } from "@tanstack/react-query"

/**
 * Ключи запросов лаборатории — ЕДИНСТВЕННОЕ место, где они собираются. Писать руками
 * ["lab", ...] нельзя: для react-query 5 и "5" — разные ключи. Именно так вкладка участников
 * (ключ с числом) перестала сбрасываться страницей (ключ со слагом из URL).
 *
 * Правило: всё, кроме самой карточки, ключуется ЧИСЛОВЫМ lab.id. Карточка — единственный запрос,
 * который грузится до того, как id известен, поэтому её ключ строится по параметру URL
 * (слаг или число).
 */
export const labKeys = {
  card: (urlParam: string) => ["lab", urlParam] as const,
  members: (labId: number) => ["lab", labId, "members"] as const,
  requests: (labId: number) => ["lab", labId, "requests"] as const,
  goalTask: (labId: number) => ["lab", labId, "goal-task"] as const,
  goalQuestion: (labId: number) => ["lab", labId, "goal-question"] as const,
  // Снимки неизменяемы (у их подзапросов staleTime: Infinity), общими инвалидациями ниже они не
  // задеваются. Ключ занятого места лежит под ключом списка: сброс списка обновляет и его.
  checkpoints: (labId: number) => ["lab", labId, "checkpoints"] as const,
  checkpointsStorage: (labId: number) => ["lab", labId, "checkpoints", "storage"] as const,
  files: (labId: number) => ["lab", labId, "files"] as const,
}

/**
 * Карточка лаборатории (GET /labs/{id}) несёт счётчики вкладок (observations_count,
 * hypotheses_count, predictions_count, results_count), роль и member_count. Любая вкладка,
 * которая создаёт или удаляет сущность, обязана её сбросить, иначе бейдж отстаёт до
 * перезагрузки страницы.
 *
 * Параметр URL может быть слагом ИЛИ числом, а вкладкам известен только числовой labId,
 * поэтому карточку ищем по содержимому кэша (data.id), а не по ключу. Сбрасывается ТОЛЬКО
 * карточка: остальные запросы лаборатории (участники, снимки, файлы) этим не задеваются.
 */
export function invalidateLabCard(qc: QueryClient, labId: number) {
  return qc.invalidateQueries({
    predicate: q =>
      q.queryKey[0] === "lab" &&
      q.queryKey.length === 2 &&
      (q.state.data as { id?: number } | undefined)?.id === labId,
  })
}

/** Состав лаборатории изменился (принята заявка, вступление, выход): участники, заявки и карточка. */
export function invalidateLabMembership(qc: QueryClient, labId: number) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: labKeys.members(labId) }),
    qc.invalidateQueries({ queryKey: labKeys.requests(labId) }),
    invalidateLabCard(qc, labId),
  ])
}
