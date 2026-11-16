// Общий паттерн для update-мутаций сущностей с EntityLinkPicker/LocalImagePicker
// в форме редактирования (наблюдения/прогнозы/гипотезы и, вероятно, другие —
// см. Этап 8, 18.08). Все формы сущностей отдают links/images отдельными полями onSave
// ({ data, links, images, pendingFiles }, см. entity-submit.ts), поэтому здесь принимается уже
// извлечённое links/images, а не сам объект формы.
import { createLinksFor, type PendingLink } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"

export async function updateEntityWithLinks<T>(
  entityType: string,
  id: number,
  updateFn: (id: number, body: any) => Promise<T>,
  body: any,
  links?: PendingLink[],
  images?: File[],
): Promise<T> {
  const updated = await updateFn(id, body)
  if (links?.length) await createLinksFor(entityType, id, links)
  if (images?.length) await uploadImagesFor(entityType, id, images)
  return updated
}
