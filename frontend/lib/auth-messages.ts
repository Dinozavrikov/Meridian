/** Текст ответа 429 ограничения частоты. Копия RATE_LIMIT_MESSAGE из backend/app/core/auth_ui_strings.py:
 *  охранный тест auth-strings.guard.test.ts следит, чтобы они совпадали. */
export const RATE_LIMITED_MESSAGE = "Слишком много попыток. Попробуйте позже."

/** Ошибки входа через Google: google_callback возвращает на /login с ?google_error=<код>. Коды сверяет охранный тест
 *  auth-strings.guard.test.ts с backend/app/api/v1/auth.py, тексты он же сверяет с белым списком гостя. */
export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  denied: "Вход через Google отменен. Можно попробовать еще раз или войти по паролю.",
  token_exchange_failed: "Google не подтвердил вход. Попробуйте еще раз чуть позже или войдите по паролю.",
  userinfo_failed: "Google не подтвердил вход. Попробуйте еще раз чуть позже или войдите по паролю.",
  incomplete_profile: "Google не передал адрес почты, без него войти не получится. Попробуйте еще раз или войдите по паролю.",
  email_not_verified: "Адрес почты в этом аккаунте Google не подтвержден. Подтвердите его в Google и попробуйте снова.",
  account_linked_other: "Этот адрес почты уже связан с другим аккаунтом Google. Войдите тем аккаунтом Google, который привязывали раньше, или по паролю, если он задан.",
  region_blocked: "Авторизация через Google недоступна для пользователей из Российской Федерации в соответствии с требованиями законодательства РФ.",
  state_mismatch: "Сессия входа через Google истекла или была прервана. Начните вход заново.",
}
export const GOOGLE_ERROR_FALLBACK = "Не удалось войти через Google. Попробуйте еще раз или войдите по паролю."
export const GOOGLE_ERROR_STRINGS: string[] = Array.from(new Set([...Object.values(GOOGLE_ERROR_MESSAGES), GOOGLE_ERROR_FALLBACK]))

export function googleErrorMessage(code: string): string {
  // Код приходит из адреса страницы: имена из прототипа (constructor и т.п.) не должны находиться как свои ключи.
  return Object.prototype.hasOwnProperty.call(GOOGLE_ERROR_MESSAGES, code) ? GOOGLE_ERROR_MESSAGES[code] : GOOGLE_ERROR_FALLBACK
}
