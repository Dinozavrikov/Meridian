"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { authApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { v2, theme } from "@/lib/theme"
import { AuthVisual } from "@/components/auth/auth-visual"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api-error"
import { RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"

const PAGE_STRINGS = [
  "От догадки — к уверенности",
  "Через полгода вы забудете, во что верили сейчас. Meridian не даст соврать себе задним числом.",
  "Регистрация",
  "Имя пользователя", "3–32 символа, буквы, цифры, _ и -, без пробелов",
  "Имя пользователя не может содержать пробелы — используйте _ или -",
  "Пароль слишком длинный",
  "Email",
  "Отображаемое имя", "Как вас называть?",
  "Пароль", "Минимум 8 символов",
  "Ошибка регистрации",
  "Создание аккаунта...", "Создать аккаунт",
  "Уже есть аккаунт?",
  "Войти",
  "Подождите проверку и попробуйте снова", "Проверьте введенные данные",
  RATE_LIMITED_MESSAGE,
]

export default function RegisterPage() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  useEffect(() => { document.title = "Регистрация · Meridian" }, [])

  const router = useRouter()
  const setUser = useStore(s => s.setUser)
  const [form, setForm] = useState({ username: "", email: "", password: "", display_name: "", website: "" })
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState("")
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Explicit rendering (не auto-render) — контролируем момент монтирования
  // сами через onLoad колбэк next/script, а не полагаемся на data-атрибуты
  // + порядок загрузки скрипта относительно рендера DOM-узла.
  const renderTurnstile = () => {
    const w = (window as any).turnstile
    if (!w || !turnstileRef.current || widgetIdRef.current) return
    widgetIdRef.current = w.render(turnstileRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      size: "flexible",
      callback: (token: string) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(""),
    })
  }

  useEffect(() => {
    // На случай если next/script's onLoad уже отработал до маунта этого
    // компонента (fast refresh в dev, повторный визит без полной перезагрузки
    // страницы) — window.turnstile уже может существовать при маунте.
    renderTurnstile()
    return () => {
      const w = (window as any).turnstile
      if (w && widgetIdRef.current) w.remove(widgetIdRef.current)
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setFieldErrors({})
    if (!turnstileToken) {
      setError(dt("Подождите проверку и попробуйте снова"))
      return
    }
    setLoading(true)
    try {
      const u = await authApi.register({ ...form, turnstile_token: turnstileToken })
      setUser(u)
      router.push("/onboarding")
    } catch (e: any) {
      const fields = apiFieldErrors(e)
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields)
      } else {
        setError(e?.response?.status === 429
          ? dt(RATE_LIMITED_MESSAGE)
          : apiErrorMessage(e, dt("Ошибка регистрации"), dt("Проверьте введенные данные")))
      }
    } finally {
      setLoading(false)
    }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

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
          <p className="text-sm mt-2" style={{ color: "rgba(242,239,233,0.75)", fontFamily: v2.fontSerif, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11 }}>
            {dt("От догадки — к уверенности")}
          </p>
          <p className="text-xs mt-3" style={{ color: v2.t3, opacity: 0.85, lineHeight: 1.5 }}>
            {dt("Через полгода вы забудете, во что верили сейчас. Meridian не даст соврать себе задним числом.")}
          </p>
        </div>
        <form onSubmit={submit} className="rounded-xl p-6 flex flex-col gap-4" style={{ background: v2.surf, border: `1px solid ${v2.bd}` }}>
          <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Регистрация")}</h2>
          <Input label={dt("Имя пользователя")} placeholder={dt("3–32 символа, буквы, цифры, _ и -, без пробелов")} value={form.username} onChange={f("username")} error={fieldErrors.username ? dt(fieldErrors.username) : undefined} autoComplete="username" required />
          <Input label={dt("Email")} type="email" placeholder="you@example.com" value={form.email} onChange={f("email")} autoComplete="email" required />
          <Input label={dt("Отображаемое имя")} placeholder={dt("Как вас называть?")} value={form.display_name} onChange={f("display_name")} />
          <Input label={dt("Пароль")} type="password" placeholder={dt("Минимум 8 символов")} value={form.password} onChange={f("password")} error={fieldErrors.password ? dt(fieldErrors.password) : undefined} autoComplete="new-password" required />

          {/* Honeypot — невидимо человеку (off-screen, не display:none — некоторые
              боты пропускают display:none/visibility:hidden как явный сигнал ловушки,
              но реже проверяют реальную позицию на экране), видимо парсеру бота. */}
          <input
            type="text" name="website" value={form.website} onChange={f("website")}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />

          <div ref={turnstileRef} className="w-full" />

          {error && <p className="text-xs text-[#E74C3C] bg-[#E74C3C11] border border-[#E74C3C33] rounded-lg px-3 py-2">{dt(error)}</p>}
          <Button variant="primary" className="w-full mt-1" disabled={loading || !turnstileToken}>
            {loading ? dt("Создание аккаунта...") : dt("Создать аккаунт")}
          </Button>
          <p className="text-xs text-center text-[#505050]">
            {dt("Уже есть аккаунт?")}{" "}
            <Link href="/login" style={{ color: theme.accent }} className="hover:underline">{dt("Войти")}</Link>
          </p>
        </form>
      </div>
      </div>
      <AuthVisual />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" onLoad={renderTurnstile} />
    </div>
  )
}
