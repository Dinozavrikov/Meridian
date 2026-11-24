"use client"
import { useEffect } from "react"
import Link from "next/link"
import { authApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { useT, useTranslationsLoader } from "@/lib/i18n/useT"
import { LocaleSwitcher } from "@/components/layout/locale-switcher"
import { Footer } from "@/components/layout/footer"
import { SITE_LINKS } from "@/lib/site/links"
import { v2 } from "@/lib/theme"

/** Оболочка публичного сайта (группа (site)): шапка, страница, подвал. Не ждет ответа auth/me: текст страницы и ссылки
 *  есть уже в серверном HTML, а кнопки входа заменяются на «В приложение», когда сессия подтвердилась. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const t = useT()
  const user = useStore(s => s.user)
  const setUser = useStore(s => s.setUser)
  useTranslationsLoader()

  useEffect(() => {
    authApi.me().then(u => setUser(u)).catch(() => setUser(null))
  }, [setUser])

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: v2.bg }}>
      <header className="site-header">
        <Link href="/" className="site-logo" aria-label="Meridian" style={{
          textDecoration: "none", fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", color: v2.t1, userSelect: "none",
        }}>
          MER<span style={{ color: v2.teal }}>I</span>DIAN
        </Link>
        <nav className="site-nav" aria-label={t("sitePage.nav.aria")}>
          {SITE_LINKS.map(l => <Link key={l.href} href={l.href}>{t(l.labelKey)}</Link>)}
        </nav>
        <div className="site-header-end">
          <LocaleSwitcher />
          {user ? (
            <Link href="/dashboard" className="site-btn site-btn--primary">{t("sitePage.nav.app")}</Link>
          ) : (
            <>
              <Link href="/login" className="site-btn">{t("sitePage.nav.login")}</Link>
              <Link href="/register" className="site-btn site-btn--primary">{t("sitePage.nav.start")}</Link>
            </>
          )}
        </div>
      </header>
      <main style={{ flex: "1 0 auto" }}>{children}</main>
      <Footer />
    </div>
  )
}
