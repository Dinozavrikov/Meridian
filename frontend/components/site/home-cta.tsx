"use client"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { HOME_KEYS } from "@/lib/site/home"
import { SANDBOX_ID } from "@/lib/site/sandbox"

/** Кнопки главной: гостю создать аккаунт и войти, вошедшему открыть приложение. С sandbox добавляется переход к песочнице. */
export function HomeCta({ sandbox = false }: { sandbox?: boolean }) {
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
      {sandbox && <a className="feat-cta" href={`#${SANDBOX_ID}`}>{t(HOME_KEYS.ctaSandbox)}</a>}
    </div>
  )
}
