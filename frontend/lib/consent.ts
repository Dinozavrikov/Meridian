/** Выбор «кому видно», когда связь раскрывает приватную запись рядом с записью лаборатории: сервер отвечает 409 needs_consent
 *  с описанием и допустимыми вариантами (options), перехватчик в lib/api.ts спрашивает здесь, диалог
 *  (components/entities/consent-dialog.tsx) отвечает выбором. Запрос повторяется с share=<выбор>.
 *  Модуль не импортирует api (иначе цикл). Без зарегистрированного диалога ответ всегда «отмена»: молча не раскрываем. */
export type ShareChoice = "me" | "lab" | "public"

export interface ConsentImpact {
  entity_type: string; entity_id: number | null; title: string; owner_id: number
  lab_id: number; lab_name: string; lab_is_public: boolean; open_join: boolean; members: number
  via_type: string; via_id: number | null; via_title: string
  options: ShareChoice[]
}

type Handler = (impacts: ConsentImpact[]) => Promise<ShareChoice | null>
let handler: Handler | null = null

export function setConsentHandler(h: Handler | null) { handler = h }

export function askConsent(impacts: ConsentImpact[]): Promise<ShareChoice | null> {
  return handler ? handler(impacts) : Promise.resolve(null)
}
