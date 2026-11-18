"use client"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useStore } from "@/lib/store"
import { useTranslationsLoader } from "@/lib/i18n/useT"
import { authApi } from "@/lib/api"
import { Sidebar } from "./sidebar"
import { GuestSidebar } from "./guest-sidebar"
import { SearchModal } from "./search-modal"
import { RAIL_WIDTH } from "@/lib/nav"

import { isGuestAllowedPath, isPrerenderedPath } from "@/lib/guest-access"
import { useIsMobile } from "@/lib/use-is-mobile"
import Link from "next/link"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const GUEST_BANNER_STRINGS = [
  "Публичный слой — вы гость",
  "Войти",
  "Регистрация",
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, setUser, setSearchOpen } = useStore()
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [authChecked, setAuthChecked] = useState(false)
  const dt = useDynamicTranslate(collectStrings(GUEST_BANNER_STRINGS))

  // Единая точка входа для загрузки переводов на всю (app)-группу — не
  // зависит от того, какой конкретно Header/layout смонтирован на странице
  // (или смонтирован ли он вообще), поэтому переводы работают одинаково
  // и на "обычных" страницах, и на тех, где своя обвязка вокруг Header.
  useTranslationsLoader()

  useEffect(() => {
    authApi.me()
      .then(u => {
        setUser(u)
      })
      .catch(() => {
        setUser(null)
        if (!isGuestAllowedPath(pathname)) router.push("/login")
      })
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT","TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Пока не знаем, гость это или нет, не показываем ни один из сайдбаров —
  // иначе на долю секунды мелькнёт не тот вариант даже для залогиненных.
  // Публичные страницы рисуются сразу, в том числе на сервере: иначе краулер без JS видит пустой экран.
  // Структура дерева одна и та же до и после проверки (сайдбары заменяются на null), иначе страница пересоздалась бы.
  if (!authChecked && !isPrerenderedPath(pathname)) {
    return <div style={{ height: "100vh", background: "#0b0d14" }} />
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0b0d14" }}>
      {/* Спейсер под fixed-сайдбар: виден только там же, где виден сам
          сайдбар (md и шире). На мобильном сайдбара нет — значит и
          спейсер не нужен, контент занимает всю ширину экрана. */}
      <div className={user || !authChecked ? "block" : "hidden md:block"} style={{ width: user || !authChecked ? RAIL_WIDTH : 180, flexShrink: 0 }} />
      {!authChecked ? null : user ? <Sidebar /> : <GuestSidebar />}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex", flexDirection: "column",
      }}>
        {/* Мобильный эквивалент GuestSidebar: та же суть ("публичный слой",
            призыв зарегистрироваться), но горизонтальным компактным
            баннером сверху вместо колонки в 180px, которой на телефоне
            просто нет места. */}
        {authChecked && !user && isMobile && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", flexShrink: 0,
            background: "#27AE6010", borderBottom: "1px solid #27AE6028",
          }}>
            <Globe size={13} style={{ color: "#27AE60", flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "#27AE60", fontWeight: 600, flex: 1, minWidth: 0 }}>
              {dt("Публичный слой — вы гость")}
            </span>
            <Link href="/login" style={{ textDecoration: "none", flexShrink: 0 }}>
              <Button variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>{dt("Войти")}</Button>
            </Link>
            <Link href="/register" style={{ textDecoration: "none", flexShrink: 0 }}>
              <Button variant="primary" style={{ padding: "4px 10px", fontSize: 12 }}>{dt("Регистрация")}</Button>
            </Link>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </div>
      {authChecked && <SearchModal />}
    </div>
  )
}
