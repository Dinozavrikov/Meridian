"use client"
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { CONTACT_EMAIL } from "@/lib/contact"
import { formatTtl, usePrivacyFacts, type PrivacyFacts } from "@/lib/privacy"

interface Ctx { facts: PrivacyFacts | undefined; failed: boolean }
const PrivacyCtx = createContext<Ctx>({ facts: undefined, failed: false })

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { data, isError } = usePrivacyFacts()
  const value = useMemo<Ctx>(() => ({ facts: data, failed: isError }), [data, isError])
  return <PrivacyCtx.Provider value={value}>{children}</PrivacyCtx.Provider>
}

export const usePrivacy = () => useContext(PrivacyCtx)

/** Текст по ключу: почта и сроки подставляются в плейсхолдеры. Пока сроки едут с сервера, на их месте многоточие. */
export function usePrivacyText() {
  const t = useT()
  const { facts } = usePrivacy()
  return useCallback((key: string, extra?: Record<string, string | number>) => t(key, {
    email: CONTACT_EMAIL,
    refreshTtl: facts ? formatTtl(t, facts.session.refresh_days * 86400) : "…",
    resetTtl: facts ? formatTtl(t, facts.reset_link_minutes * 60) : "…",
    ...extra,
  }), [t, facts])
}
