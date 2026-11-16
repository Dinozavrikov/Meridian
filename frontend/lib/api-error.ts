// Человекочитаемый текст ошибки API. detail бывает строкой (HTTPException) или массивом (422 от
// pydantic): массив нельзя класть в setError/JSX (React падает) и нельзя склеивать со строкой
// ("[object Object]"). Из массива берём только наши сообщения валидаторов (они русские и
// начинаются с "Value error, "); встроенные английские сообщения pydantic заменяем на `invalid`.
const VALUE_ERROR = "Value error, "


/**
 * Поля с ошибками из 422 от pydantic: {field: message}. Только наши
 * value_error (без префикса "Value error, "). Встроенные английские
 * pydantic-сообщения (email, string_too_long) сюда НЕ попадают — их
 * место в общей плашке через apiErrorMessage.
 */
export function apiFieldErrors(e: unknown): Record<string, string> {
  const detail = (e as { response?: { data?: { detail?: unknown } } } | null | undefined)?.response?.data?.detail
  if (!Array.isArray(detail)) return {}
  const out: Record<string, string> = {}
  for (const d of detail) {
    if (!d || typeof d !== "object") continue
    const loc = (d as { loc?: unknown }).loc
    if (!Array.isArray(loc) || loc.length < 2) continue
    const field = loc[loc.length - 1]
    if (typeof field !== "string") continue
    const msg = (d as { msg?: unknown }).msg
    if (typeof msg !== "string" || !msg.startsWith(VALUE_ERROR)) continue
    out[field] = msg.slice(VALUE_ERROR.length)
  }
  return out
}

export function apiErrorMessage(e: unknown, fallback: string, invalid: string = fallback): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } } | null | undefined)?.response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const own = detail
      .map(d => (d && typeof d === "object" ? (d as { msg?: unknown }).msg : null))
      .filter((m): m is string => typeof m === "string" && m.startsWith(VALUE_ERROR))
      .map(m => m.slice(VALUE_ERROR.length))
    return own.length ? Array.from(new Set(own)).join(", ") : invalid
  }
  return fallback
}
