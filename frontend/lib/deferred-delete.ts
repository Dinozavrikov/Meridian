// Отложенное удаление с «Вернуть»: ничего не удалено, пока идёт окно. Таймер живёт на уровне модуля,
// поэтому закрытие окна, из которого нажали, его не убивает. Без React и без обращений к API.
import { UNDO_TOAST_MS } from "@/lib/toast"

/** Окно по умолчанию для удаления, не привязанного к тосту. */
export const DELETE_DELAY_MS = UNDO_TOAST_MS + 500
/** Страховка для удаления, привязанного к тосту. Обычно оно уходит, когда тост закрылся (commitDelete); таймер на случай,
 *  если тост потерялся (хост не смонтирован, вкладка уснула). */
export const DELETE_SAFETY_MS = 60_000

interface Entry {
  timer: ReturnType<typeof setTimeout>
  run: () => Promise<unknown>
  leave?: () => void
  onSettled: (ok: boolean) => void
}
const pending = new Map<string, Entry>()

function settle(e: Entry) {
  Promise.resolve().then(e.run).then(() => e.onSettled(true), () => e.onSettled(false))
}

/** true: поставлено. false: этот ключ уже ожидает удаления. leave: что сделать при уходе со страницы (fetch keepalive). */
export function scheduleDelete(key: string, o: { run: () => Promise<unknown>; onSettled: (ok: boolean) => void; leave?: () => void; delayMs?: number }): boolean {
  if (pending.has(key)) return false
  const entry: Entry = { run: o.run, leave: o.leave, onSettled: o.onSettled, timer: undefined as unknown as ReturnType<typeof setTimeout> }
  entry.timer = setTimeout(() => {
    if (pending.get(key) !== entry) return
    pending.delete(key)
    settle(entry)
  }, o.delayMs ?? DELETE_DELAY_MS)
  pending.set(key, entry)
  return true
}

/** true: удаление отменено. false: ничего не ожидало (уже ушло или не ставилось). */
export function cancelDelete(key: string): boolean {
  const e = pending.get(key)
  if (!e) return false
  clearTimeout(e.timer)
  pending.delete(key)
  return true
}

/** Тост закрылся без «Вернуть»: выполнить удаление сейчас. true: ушло; false: нечего выполнять (отменено или уже ушло). */
export function commitDelete(key: string): boolean {
  const e = pending.get(key)
  if (!e) return false
  clearTimeout(e.timer)
  pending.delete(key)
  settle(e)
  return true
}

/** Выполнить всё ожидающее сейчас: решение пользователя исполняется, откат пропадает. */
export function flushDeletes(): void {
  for (const [key, e] of [...pending]) {
    clearTimeout(e.timer)
    pending.delete(key)
    if (e.leave) e.leave()
    else settle(e)
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushDeletes)
