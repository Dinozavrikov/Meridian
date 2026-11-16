"use client"
import { useState, useEffect } from "react"
import { authApi } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { v2, theme } from "@/lib/theme"
import { AuthVisual } from "@/components/auth/auth-visual"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const PAGE_STRINGS = [
  "От догадки — к уверенности",
  "Восстановление пароля",
  "Укажите email, привязанный к аккаунту, и мы пришлём ссылку для сброса пароля.",
  "Email",
  "Отправка...", "Отправить ссылку",
  "Если аккаунт с таким email существует, письмо со ссылкой для сброса пароля уже отправлено. Проверьте почту (и папку «Спам»).",
  "Вернуться ко входу",
]

export default function ForgotPasswordPage() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  useEffect(() => { document.title = "Восстановление пароля · Meridian" }, [])

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } finally {
      // Один и тот же результат независимо от ответа сервера — бэкенд и так
      // не раскрывает, существует ли аккаунт (см. forgot_password в auth.py),
      // а тут дублируем ту же осторожность на случай сетевой ошибки: не
      // показываем разницу между "не нашли" и "не достучались до сервера".
      setLoading(false)
      setSent(true)
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
          <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Восстановление пароля")}</h2>

          {sent ? (
            <>
              <p className="text-sm" style={{ color: "rgba(242,239,233,0.7)", lineHeight: 1.6 }}>
                {dt("Если аккаунт с таким email существует, письмо со ссылкой для сброса пароля уже отправлено. Проверьте почту (и папку «Спам»).")}
              </p>
              <Link href="/login" style={{ color: theme.accent, fontSize: 13, textDecoration: "none" }} className="hover:underline">
                {dt("Вернуться ко входу")}
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <p className="text-sm" style={{ color: "rgba(242,239,233,0.55)", lineHeight: 1.6 }}>
                {dt("Укажите email, привязанный к аккаунту, и мы пришлём ссылку для сброса пароля.")}
              </p>
              <Input
                label={dt("Email")}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Button variant="primary" className="w-full mt-1" disabled={loading}>
                {loading ? dt("Отправка...") : dt("Отправить ссылку")}
              </Button>
              <Link href="/login" style={{ color: theme.accent, fontSize: 13, textDecoration: "none", textAlign: "center" }} className="hover:underline">
                {dt("Вернуться ко входу")}
              </Link>
            </form>
          )}
        </div>
      </div>
      </div>
      <AuthVisual />
    </div>
  )
}
