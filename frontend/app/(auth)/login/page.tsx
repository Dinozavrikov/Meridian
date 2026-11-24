"use client"
import { useState, useEffect} from "react"
import { useRouter } from "next/navigation"
import { authApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { v2, theme } from "@/lib/theme"
import { AuthVisual } from "@/components/auth/auth-visual"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { apiErrorMessage } from "@/lib/api-error"
import { GOOGLE_ERROR_STRINGS, googleErrorMessage, RATE_LIMITED_MESSAGE } from "@/lib/auth-messages"

const PAGE_STRINGS = [
  "От догадки — к уверенности",
  "Вход",
  "Имя пользователя", "username",
  "Пароль",
  "Ошибка входа",
  "Вход...", "Войти",
  "Нет аккаунта?",
  "Зарегистрироваться",
  "или",
  "Забыли пароль?",
  "Войти через Google",
  "Авторизация через Google недоступна для пользователей из Российской Федерации в соответствии с требованиями законодательства РФ.",
  "Геоданные IP предоставлены",
  RATE_LIMITED_MESSAGE,
  ...GOOGLE_ERROR_STRINGS,
]

export default function LoginPage() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  useEffect(() => { document.title = "Вход · Meridian" }, [])

  const router = useRouter()
  const setUser = useStore(s => s.setUser)
  const [form, setForm] = useState({ username: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null)

  // Бэкенд возвращает сюда с ?google_error=<код>, если вход через Google не состоялся: без этого человек видел бы пустую форму.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("google_error")
    if (code === null) return
    setError(googleErrorMessage(code))
    params.delete("google_error")
    const rest = params.toString()
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : ""))
  }, [])

  useEffect(() => {
    authApi.googleAvailable()
      .then(r => setGoogleAvailable(r.available))
      .catch(() => setGoogleAvailable(false)) // сбой запроса — не показываем кнопку, безопасный дефолт для UI (бэкенд всё равно перепроверит гео сам на реальном заходе)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const u = await authApi.login(form)
      setUser(u)
      router.push("/dashboard")
    } catch (e: any) {
      setError(e?.response?.status === 429 ? dt(RATE_LIMITED_MESSAGE) : apiErrorMessage(e, dt("Ошибка входа")))
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

        <form onSubmit={submit} className="rounded-xl p-6 flex flex-col gap-4" style={{ background: v2.surf, border: `1px solid ${v2.bd}` }}>
          <h2 className="text-base font-semibold" style={{ color: v2.t1 }}>{dt("Вход")}</h2>

          <Input
            label={dt("Имя пользователя")}
            placeholder="username"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            autoComplete="username"
            required
          />
          <Input
            label={dt("Пароль")}
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            autoComplete="current-password"
            required
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>
            <Link href="/forgot-password" style={{ fontSize: 11, color: "rgba(242,239,233,0.45)", textDecoration: "none" }}>
              {dt("Забыли пароль?")}
            </Link>
          </div>

          {error && <p className="text-xs text-[#E74C3C]">{dt(error)}</p>}

          <Button variant="primary" className="w-full mt-1" disabled={loading}>
            {loading ? dt("Вход...") : dt("Войти")}
          </Button>

          {googleAvailable === true && (
            <>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ background: v2.bd }} />
                <span className="text-xs" style={{ color: "rgba(242,239,233,0.4)" }}>{dt("или")}</span>
                <div className="flex-1 h-px" style={{ background: v2.bd }} />
              </div>
              <Link href="/api/v1/auth/google/login" style={{ textDecoration: "none", width: "100%" }}>
                <Button variant="outline" size="md" className="w-full" type="button">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.28v3.1A12 12 0 0 0 12 24Z"/>
                    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l3.99-3.1Z"/>
                    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77Z"/>
                  </svg>
                  {dt("Войти через Google")}
                </Button>
              </Link>
            </>
          )}
          {googleAvailable === false && (
            <p className="text-xs text-center mt-1" style={{ color: "rgba(242,239,233,0.45)" }}>
              {dt("Авторизация через Google недоступна для пользователей из Российской Федерации в соответствии с требованиями законодательства РФ.")}
            </p>
          )}

          <p className="text-xs text-center text-[#505050]">
            {dt("Нет аккаунта?")}{" "}
            <Link href="/register" style={{ color: theme.accent }} className="hover:underline">
              {dt("Зарегистрироваться")}
            </Link>
          </p>
        </form>

        {googleAvailable !== null && (
          <p className="text-[10px] text-center mt-3" style={{ color: "rgba(242,239,233,0.3)" }}>
            {dt("Геоданные IP предоставлены")}{" "}
            <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
              DB-IP
            </a>
          </p>
        )}
      </div>
      </div>
      <AuthVisual />
    </div>
  )
}
