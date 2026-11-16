"use client"
import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { Lock } from "lucide-react"

// Показывается глобально при 403 у гостя (см. QueryCache.onError в
// app/providers.tsx) — единая точка входа, чтобы не дублировать проверку
// "гость наткнулся на приватное" в каждом компоненте отдельно.
export function AuthGateModal() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const open = useStore(s => s.authGateOpen)
  const close = useStore(s => s.closeAuthGate)

  // Подстраховка от залипания модалки поверх другой страницы: если
  // маршрут сменился (например, кликом по обычной публичной ссылке
  // вокруг модалки) — закрываем её, а не оставляем висеть поверх контента,
  // к которому она уже не относится.
  useEffect(() => { close() }, [pathname])

  function goTo(path: string) {
    // Сначала закрываем модалку, потом переходим — иначе она остаётся
    // смонтированной глобально и всплывает поверх /login или /register.
    close()
    router.push(path)
  }

  return (
    <Modal open={open} onClose={close} size="sm">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#2a2a1e", color: "#d9a441",
        }}>
          <Lock size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 6 }}>
            {t("authGate.title")}
          </h3>
          <p style={{ fontSize: 13, color: "#909090", lineHeight: 1.5 }}>
            {t("authGate.description")}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <Button variant="ghost" onClick={() => goTo("/login")} style={{ flex: 1 }}>
              {t("authGate.login")}
            </Button>
            <Button variant="primary" onClick={() => goTo("/register")} style={{ flex: 1 }}>
              {t("authGate.register")}
            </Button>
          </div>
          {/* Просто закрывает модалку, без навигации — гость мог хотеть
              остаться и читать остальной публичный контент вокруг
              (список, сайдбар), а не куда-то "назад" по истории. */}
          <button onClick={close} style={{
            background: "transparent", border: "none", color: "#9999ad",
            fontSize: 12, cursor: "pointer", padding: 4,
          }}>
            {t("authGate.stay")}
          </button>
        </div>
      </div>
    </Modal>
  )
}
