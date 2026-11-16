/** Текст подтверждения удаления лаборатории. Снимки лаборатории (backend/docs/LAB_CHECKPOINTS.md)
 *  уходят вместе с ней, в том числе опубликованные, и отдельно удалить их нельзя — об этом
 *  предупреждаем явно, а не оставляем сюрпризом. */
export function labDeleteConfirmText(
  t: (key: string, vars?: Record<string, string | number>) => string,
  name: string,
): string {
  return `${t("labsPage.deleteConfirm", { name })}\n\n${t("labsPage.deleteSnapshotsNote")}`
}
