"use client"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { HOME_KEYS } from "@/lib/site/home"

/** Кнопки главной: гостю создать аккаунт и войти, вошедшему открыть приложение. */
export function HomeCta() {
  const t = useT()
  const user = useStore(s => s.user)
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {user ? (
        <Link className="feat-cta feat-cta--primary" href="/dashboard">{t(HOME_KEYS.ctaApp)}</Link>
      ) : (
        <>
          <Link className="feat-cta feat-cta--primary" href="/register">{t(HOME_KEYS.ctaRegister)}</Link>
          <Link className="feat-cta" href="/login">{t(HOME_KEYS.ctaLogin)}</Link>
        </>
      )}
    </div>
  )
}
