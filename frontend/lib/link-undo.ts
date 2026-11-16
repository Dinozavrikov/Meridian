import { api } from "@/lib/api"
import { toast, type ToastTone } from "@/lib/toast"

type HistoryItem = { id: number; type: string; other_type: string; other_id: number; reverted: boolean; undoable: boolean }

/** Событие истории связей для «Вернуть»: свежее непогашенное откатываемое событие нужного вида по паре записей.
 *  null: откат недоступен (событие не нашлось или история не ответила); само действие к этому моменту уже выполнено. */
export async function findUndoEvent(entityType: string, entityId: number, types: string[], other: { type: string; id: number }): Promise<number | null> {
  try {
    const hist = await api.get(`/api/v1/${entityType}/${entityId}/link-history`, { params: { limit: 20, other_type: other.type, other_id: other.id } })
    const ev = (hist.data as HistoryItem[]).find(i => types.includes(i.type) && i.other_type === other.type && i.other_id === other.id && !i.reverted && i.undoable)
    return ev?.id ?? null
  } catch { return null }
}

/** Уведомление с «Вернуть» в общем хосте. undoUrl: POST-адрес отката (null: откат недоступен, только сообщение).
 *  Окно, из которого сделали действие, к этому моменту может быть закрыто: откат от него не зависит.
 *  onUndone: перечитать данные после отката. */
export function toastUndo(o: { message: string; tone?: ToastTone; undoUrl: string | null; onUndone: () => void }) {
  const url = o.undoUrl
  toast({
    message: o.message,
    tone: o.tone ?? "success",
    undo: url == null ? undefined : { run: async () => { await api.post(url); o.onUndone() } },
  })
}

/** То же для события истории связей записи: откат платформенный, POST /{тип}/{id}/undo/{событие}. */
export function toastLinkUndo(o: { entityType: string; entityId: number; eventId: number | null; message: string; tone?: ToastTone; onUndone: () => void }) {
  toastUndo({
    message: o.message, tone: o.tone, onUndone: o.onUndone,
    undoUrl: o.eventId == null ? null : `/api/v1/${o.entityType}/${o.entityId}/undo/${o.eventId}`,
  })
}

/** Какие события журнала откатывает «Вернуть» после действия. Списки разные: «изменить» с «добавить» перепутать нельзя.
 *  Дрейф с бэкендом (link_events.py) ловит lib/link-undo.guard.test.ts. */
export const LINK_UNDO_TYPES = {
  add: ["linked"],
  remove: ["unlinked", "competing_unlinked", "field_unlinked"],
  change: ["link_type_changed", "competing_changed", "field_link_changed"],
} as const
export type LinkChangeKind = keyof typeof LINK_UNDO_TYPES

export interface AnnounceOptions {
  entityType: string; entityId: number; kind: LinkChangeKind
  /** вторая запись связи: по ней ищется событие */
  other: { type: string; id: number }
  message: string; tone?: ToastTone; onUndone: () => void
}

/** Действие со связью выполнено: найти событие нужного вида по паре и показать тост с «Вернуть» (события нет: только сообщение).
 *  Одна точка вместо копий «findUndoEvent + toastLinkUndo» в менеджере, чипах, модалке и хуках. */
export async function announceLinkChange(o: AnnounceOptions): Promise<void> {
  const eventId = await findUndoEvent(o.entityType, o.entityId, [...LINK_UNDO_TYPES[o.kind]], o.other)
  toastLinkUndo({ entityType: o.entityType, entityId: o.entityId, eventId, message: o.message, tone: o.tone, onUndone: o.onUndone })
}
