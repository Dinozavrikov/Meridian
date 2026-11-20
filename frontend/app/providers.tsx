"use client"
if (typeof window !== "undefined") {
  const _ce = console.error.bind(console)
  console.error = (...args: any[]) => {
    const msg = args[0]?.toString?.() ?? ""
    if (msg.includes("hydrated") && (msg.includes("didn't match") || msg.includes("did not match"))) return
    _ce(...args)
  }
}
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { AuthGateModal } from "@/components/layout/auth-gate-modal"

// Единая точка перехвата "гость наткнулся на приватную страницу": 403 от
// API + отсутствие сессии в сторе означает именно это (залогиненный юзер
// без прав на чужую приватную запись — по-прежнему просто 403 без модалки
// регистрации, ему предлагать зарегистрироваться бессмысленно).
function isGuestForbidden(error: any): boolean {
  if (error?.response?.status !== 403) return false
  return useStore.getState().user === null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (isGuestForbidden(error)) useStore.getState().openAuthGate()
      },
    }),
  }))
  // Режим перевода выбирает человек и он переживает перезагрузку; читаем после монтирования,
  // чтобы первая отрисовка совпала с серверной.
  useEffect(() => { useStore.getState().restoreTranslationScope() }, [])
  return (
    <QueryClientProvider client={qc}>
      {children}
      <AuthGateModal />
    </QueryClientProvider>
  )
}
