/** Личные заметки владельца на странице дискуссии. Зеркало бэкендного правила (backend/app/core/personal_notes.py):
 *  корневой комментарий ВЛАДЕЛЬЦА записи без позиции (stance == null) — его заметка для себя, вместе со всеми ответами
 *  под ней; остальное — обсуждение. Бэкенд отдаёт владельцу всё, поэтому разделение делает страница. */
export interface NoteLike<T> { author_username: string; stance?: string | null; replies?: T[] }

export function splitPersonalNotes<T extends NoteLike<T>>(
  comments: T[], ownerUsername: string | null | undefined,
): { discussion: T[]; personal: T[] } {
  const discussion: T[] = []
  const personal: T[] = []
  for (const c of comments) {
    const mine = !!ownerUsername && c.author_username === ownerUsername && (c.stance ?? null) === null
    ;(mine ? personal : discussion).push(c)
  }
  return { discussion, personal }
}
