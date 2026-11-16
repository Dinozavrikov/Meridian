"use client"
// frontend/lib/use-quick-create-and-link.ts
//
// Общая логика для всех "quick create" модалок (Observation/Prediction/Hypothesis/Worldview/Task/
// Question, создаваемых из контекста другой сущности с автоматической привязкой через Link). Не путать
// с create-мутациями на страницах списков (там своя) и с AddForecastModal (жёсткий FK hypothesis_id).
//
// Привязка к родителю — поздний шаг: запись к этому моменту уже создана, поэтому её провал НЕ роняет
// мутацию (иначе форма осталась бы открытой, и повторное «Сохранить» создало бы дубль записи). Провал
// помечается в _failedSteps и показывается пользователю (usePartialCreateNotice) — для всех модалок,
// использующих этот хук, самим хуком.
//
// «Вернуть» после создания: только для ЛИЧНОЙ записи (visibility === "private") и только если все шаги
// удались. Откат = DELETE записи (мягкое удаление в корзину): связь с записью из корзины не показывается
// нигде (links_alive), при восстановлении возвращается. Запись лаборатории или публичную могли уже увидеть
// другие, их «Вернуть» не развидит: для них тоста нет (подтверждение ДО действия — вне этого шага).
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { createLinksFor, type PendingLink } from "@/components/entities/entity-link-picker"
import { entityDeleteUrl } from "@/lib/entity-delete-path"
import { useT } from "@/lib/i18n/useT"
import { runPostCreateSteps, type PostCreateStep } from "@/lib/partial-create"
import { toast } from "@/lib/toast"
import { usePartialCreateNotice } from "@/lib/use-partial-create-notice"

interface QuickCreateAndLinkParams<TBody> {
  /** тип создаваемой сущности, как в graph/links (observation|worldview|task|question|hypothesis|prediction) */
  entityType: string
  /** процедура создания: api-клиент с методом create или createXFull; может вернуть _failedSteps */
  create: (body: TBody) => Promise<any>
  /** зафиксированный родитель, к которому автоматически привязываем созданное */
  target: { type: string; id: number }
  /** тип связи для автолинка (по умолчанию "связано") */
  linkType?: string
  /** доп. query keys для инвалидации, специфичные для конкретной сущности (например ["observations"]) */
  invalidateKeys?: (string | number)[][]
  onSuccess?: (created: any) => void
}

export function useQuickCreateAndLink<TBody = any>({
  entityType, create, target, linkType = "связано", invalidateKeys = [], onSuccess,
}: QuickCreateAndLinkParams<TBody>) {
  const qc = useQueryClient()
  const t = useT()
  const notifyPartial = usePartialCreateNotice()

  const refresh = (createdId: number) => {
    qc.invalidateQueries({ queryKey: ["related", target.type, target.id] })
    qc.invalidateQueries({ queryKey: ["related", entityType, createdId] })
    qc.invalidateQueries({ queryKey: ["feed"] })
    invalidateKeys.forEach(key => qc.invalidateQueries({ queryKey: key }))
  }

  return useMutation({
    mutationFn: async (body: TBody) => {
      const created = await create(body)
      // автопривязка к зафиксированному родителю — не через EntityLinkPicker (тот копит связи в
      // состоянии формы ДО создания), а сразу, т.к. родитель известен и не меняется пользователем
      const failed = await runPostCreateSteps([
        ["links", () => createLinksFor(entityType, created.id, [
          { type: target.type, id: target.id, title: "", link_type: linkType } as PendingLink,
        ])],
      ])
      const all: PostCreateStep[] = [...(created?._failedSteps ?? []), ...failed]
      return all.length ? { ...created, _failedSteps: all } : created
    },
    onSuccess: (created) => {
      notifyPartial(created)
      if (!created._failedSteps?.length && created.visibility === "private") {
        toast({
          message: t("quickCreate.created"),
          tone: "success",
          undo: { run: async () => { await api.delete(entityDeleteUrl(entityType, created.id)); refresh(created.id) } },
        })
      }
      refresh(created.id)
      onSuccess?.(created)
    },
  })
}
