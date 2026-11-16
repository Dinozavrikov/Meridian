// Единые всплывающие уведомления вместо window.alert и встроенных строк «Вернуть». Хост (ToastHost) монтируется один раз
// в app/(app)/layout.tsx. Вызывать: toast({ message, tone, undo }). Текст приходит уже переведённым (t(...) у вызывающего).
export type ToastTone = "success" | "info" | "warn" | "error"

export type ToastCloseReason = "closed" | "undone"

export interface ToastRequest {
  message: string
  tone?: ToastTone
  /** «Вернуть»: хост подпишет кнопку, заблокирует её на время выполнения и покажет ошибку, если откат не удался. */
  undo?: { run: () => Promise<unknown> | unknown; label?: string }
  /** 0: не закрывать само. По умолчанию: с «Вернуть» 8 с, предупреждения и ошибки 10 с, остальное 4,5 с. */
  durationMs?: number
  /** Тост убран. "undone": «Вернуть» сработала. "closed": иначе (таймер, крестик, вытеснен новыми, откат не удался). */
  onClose?: (reason: ToastCloseReason) => void
}

type Handler = (r: ToastRequest) => void
let handler: Handler | null = null
export function setToastHandler(h: Handler | null) { handler = h }

export const UNDO_TOAST_MS = 8000
export function toastDurationMs(r: ToastRequest): number {
  if (r.durationMs != null) return r.durationMs
  if (r.undo) return UNDO_TOAST_MS
  return r.tone === "warn" || r.tone === "error" ? 10000 : 4500
}

export function toast(r: ToastRequest): void {
  if (handler) handler(r)
  else console.warn("toast: ToastHost не смонтирован, уведомление потеряно:", r.message)
}
