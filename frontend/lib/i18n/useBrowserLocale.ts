"use client"
import { useEffect } from "react"
import { useStore } from "@/lib/store"

/** Язык браузера/системы: "de-DE" -> "de". SSR-safe: "ru" до гидратации. */
export function browserLocale(): string {
  if (typeof window === "undefined") return "ru"
  return (navigator.language || "ru").slice(0, 2).toLowerCase()
}

/**
 * Auth-страницы (login/register/onboarding/forgot/reset) живут вне (app)-шелла
 * и показывают язык браузера, а не выбор из LocaleSwitcher: вышедший из аккаунта
 * пользователь должен видеть форму входа на языке своей системы, а не на том,
 * который он когда-то выбрал внутри аккаунта. (app)-страницы этот хук НЕ
 * используют — там setLocale работает как раньше, в пределах сессии.
 */
export function useForceBrowserLocale(): void {
  const setLocale = useStore(s => s.setLocale)
  useEffect(() => {
    const bl = browserLocale()
    if (useStore.getState().locale !== bl) setLocale(bl)
  }, [setLocale])
}
