"use client"
import type { ReactNode } from "react"
import { useForceBrowserLocale } from "@/lib/i18n/useBrowserLocale"

/**
 * Общий layout auth-страниц: форсит язык браузера при монтировании, чтобы
 * сессионный выбор из LocaleSwitcher не «протекал» из (app) в форму входа.
 * Визуально прозрачен: страницы сами рендерят свой min-h-screen-контейнер.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  useForceBrowserLocale()
  return <>{children}</>
}
