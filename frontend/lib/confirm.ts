// Единый запрос подтверждения вместо window.confirm. Хост (ConfirmHost) монтируется один раз в app/(app)/layout.tsx.
// Вызывать так: if (await askConfirm({...})) ... Обработчики синхронные: stopPropagation вызывать ДО await.
export interface ConfirmRequest { title: string; description?: string; confirmLabel?: string; tone?: "danger" | "warn" | "default" }
type Handler = (r: ConfirmRequest) => Promise<boolean>

let handler: Handler | null = null
export function setConfirmHandler(h: Handler | null) { handler = h }

export function askConfirm(r: ConfirmRequest): Promise<boolean> {
  if (!handler) return Promise.resolve(typeof window !== "undefined" && window.confirm(r.description ? `${r.title}\n\n${r.description}` : r.title))
  return handler(r)
}

/** Подтверждение по готовому тексту: до первой пустой строки заголовок, остальное описание. confirmLabel по умолчанию «Удалить». */
export function askConfirmText(text: string, confirmLabel?: string, tone: ConfirmRequest["tone"] = "danger"): Promise<boolean> {
  const i = text.indexOf("\n\n")
  return askConfirm({ title: i < 0 ? text : text.slice(0, i), description: i < 0 ? undefined : text.slice(i + 2), confirmLabel, tone })
}
