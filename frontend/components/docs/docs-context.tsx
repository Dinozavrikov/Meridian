"use client"
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { MODEL_VARS } from "@/lib/docs"
import { docsVars, useMaturityModel, type MaturityModel } from "@/lib/maturity-model"

interface Ctx { model: MaturityModel | undefined; failed: boolean; retry: () => void; locale: string; vars: Record<string, string> }
// Пока числа едут с сервера, на их месте многоточие: страница читается сразу.
const PENDING: Record<string, string> = Object.fromEntries(MODEL_VARS.map(v => [v, "…"]))
const DocsCtx = createContext<Ctx>({ model: undefined, failed: false, retry: () => {}, locale: "ru", vars: PENDING })

export function DocsProvider({ children }: { children: ReactNode }) {
  const locale = useStore(s => s.locale) as string
  const { data, isError, refetch } = useMaturityModel()
  const value = useMemo<Ctx>(() => ({
    model: data, failed: isError, retry: () => { void refetch() }, locale,
    vars: data ? docsVars(data, locale) : PENDING,
  }), [data, isError, refetch, locale])
  return <DocsCtx.Provider value={value}>{children}</DocsCtx.Provider>
}

export const useDocs = () => useContext(DocsCtx)

/** Текст по ключу: числа из модели и значения места вызова подставляются в плейсхолдеры. */
export function useDocsText() {
  const t = useT()
  const { vars } = useDocs()
  return useCallback((key: string, extra?: Record<string, string | number>) => t(key, { ...vars, ...extra }), [t, vars])
}
