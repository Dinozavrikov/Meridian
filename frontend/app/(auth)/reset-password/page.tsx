"use client"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authApi } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { v2, theme } from "@/lib/theme"
import { AuthVisual } from "@/components/auth/auth-visual"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { apiErrorMessage } from "@/lib/api-error"

const PAGE_STRINGS = [
  "От догадки — к уверенности",
  "Новый пароль",
  "Придумайте новый пароль для входа в Meridian.",
  "Новый пароль",
  "Повторите пароль",
  "Пароли не совпадают",
  "Сохранение...", "Сохранить пароль",
  "Пароль сохранен. Все другие устройства вышли из аккаунта — войдите заново с новым паролем.",
  "Перейти ко входу",
  "Ссылка недействительна или истекла",
  "Ссылка для сброса пароля недействительна, уже использована, или истек 15-минутный срок ее действия. Запросите новую.",
  "Запросить новую ссылку",
]

function ResetPasswordForm() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  useEffect(() => { document.title = "Новый пароль · Meridian" }, [])

  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [invalidToken, setInvalidToken] = useState(false)

  useEffect(() => {
    if (!token) setInvalidToken(true)
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password !== confirm) {
      setError(dt("Пароли не совпадают"))
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword({ token, new_password: password })
      setDone(true)
    } catch (e: any) {
      if (e?.response?.status === 400) {
        setInvalidToken(true)
      } else {
        setError(apiErrorMessage(e, dt("Ссылка недействительна или истекла")))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: v2.bg }}>
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/feed" style={{ textDecoration: "none" }}>
            <h1 className="text-2xl font-bold tracking-wide transition-opacity hover:opacity-75" style={{ color: v2.t1, fontFamily: "'Space Grotesk', sans-serif" }}>
              MER<span style={{ color: v2.teal }}>I</span>DIAN
            </h1>
          </Link>
          <p className="text-sm mt-2" style={{ color: "rgba(242,239,233,0.55)", fontFamily: v2.fontSerif, letterSpacing: "0.02em" }}>
            {dt("От догадки — к уверенности")}
          </p>
        </div>

        <div className="rounded-xl p-6 flex flex-col gap-4" style={{ background: v2.surf, border: `1px solid ${v2.bd}` }}>
          {invalidToken ? (
            <>
              <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Ссылка недействительна или истекла")}</h2>
              <p className="text-sm" style={{ color: "rgba(242,239,233,0.55)", lineHeight: 1.6 }}>
                {dt("Ссылка для сброса пароля недействительна, уже использована, или истек 15-минутный срок ее действия. Запросите новую.")}
              </p>
              <Link href="/forgot-password" style={{ textDecoration: "none" }}>
                <Button variant="primary" className="w-full">{dt("Запросить новую ссылку")}</Button>
              </Link>
            </>
          ) : done ? (
            <>
              <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Новый пароль")}</h2>
              <p className="text-sm" style={{ color: "rgba(242,239,233,0.7)", lineHeight: 1.6 }}>
                {dt("Пароль сохранен. Все другие устройства вышли из аккаунта — войдите заново с новым паролем.")}
              </p>
              <Link href="/login" style={{ textDecoration: "none" }}>
                <Button variant="primary" className="w-full">{dt("Перейти ко входу")}</Button>
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Новый пароль")}</h2>
              <p className="text-sm" style={{ color: "rgba(242,239,233,0.55)", lineHeight: 1.6 }}>
                {dt("Придумайте новый пароль для входа в Meridian.")}
              </p>
              <Input
                label={dt("Новый пароль")}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Input
                label={dt("Повторите пароль")}
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              {error && <p className="text-xs text-[#E74C3C]">{dt(error)}</p>}
              <Button variant="primary" className="w-full mt-1" disabled={loading}>
                {loading ? dt("Сохранение...") : dt("Сохранить пароль")}
              </Button>
            </form>
          )}
        </div>
      </div>
      </div>
      <AuthVisual />
    </div>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams требует Suspense-границу в Next.js App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
