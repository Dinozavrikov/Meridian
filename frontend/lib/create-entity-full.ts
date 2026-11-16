// frontend/lib/create-entity-full.ts
//
// Фабрика «создать запись целиком» для всех сущностей с формой: запись -> связи -> галерея ->
// подмена blob-url inline-картинок на реальные. Сущность описывается КОНФИГОМ (какой api, как
// называется поле с текстом, из чего собрать полный PUT), а не копией процедуры.
// Бросает только провал самой записи: пока её нет, форма должна остаться открытой. Поздние шаги
// изолированы (partial-create.ts): при их провале запись возвращается с _failedSteps — иначе
// повторное сохранение создало бы дубль.
import { imageApi, resolveMediaUrl } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"
import { runPostCreateSteps, type PostCreateStep } from "@/lib/partial-create"
import type { EntitySubmit } from "@/lib/entity-submit"

export interface EntityCreateConfig {
  /** "observation" | "prediction" | "hypothesis" — как в links/images API */
  entityType: string
  api: { create: (d: any) => Promise<any>; update: (id: number, d: any) => Promise<any> }
  /** поле записи, в котором лежит rich-текст с inline-картинками */
  textField: "text" | "description"
  /** Полное тело PUT из созданной записи + нового текста. Должно быть ПОЛНЫМ: не присланное поле
   *  PUT может сбросить в умолчание схемы (прогнозы бэкенд страхует, остальные нет). */
  buildUpdate: (created: any, newText: string) => Record<string, any>
}

export function makeCreateFull(cfg: EntityCreateConfig) {
  return async function createFull({ data, links, images, pendingFiles }: EntitySubmit) {
    const created = await cfg.api.create(data)
    let result: any = created
    const steps: Array<[PostCreateStep, () => Promise<unknown>]> = []
    if (links.length) steps.push(["links", () => createLinksFor(cfg.entityType, created.id, links)])
    if (images.length) steps.push(["images", () => uploadImagesFor(cfg.entityType, created.id, images)])
    if (pendingFiles.size > 0) {
      steps.push(["inline", async () => {
        let newText: string = created[cfg.textField]
        for (const [blobUrl, file] of pendingFiles) {
          const uploaded = await imageApi.upload(cfg.entityType, created.id, [file])
          const url = resolveMediaUrl(uploaded?.[0]?.url)
          if (url) newText = newText.split(blobUrl).join(url)
          URL.revokeObjectURL(blobUrl)
        }
        if (newText !== created[cfg.textField]) {
          await cfg.api.update(created.id, cfg.buildUpdate(created, newText))
          result = { ...created, [cfg.textField]: newText }
        }
      }])
    }
    const failed = await runPostCreateSteps(steps)
    return failed.length ? { ...result, _failedSteps: failed } : result
  }
}
