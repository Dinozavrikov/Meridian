import { useStore } from "@/lib/store"

// Единая точка гейтинга интерактивных действий для гостя: вместо того,
// чтобы каждый компонент отдельно проверял user===null и решал, что
// показать, действие оборачивается этим хелпером — гость увидит уже
// готовую AuthGateModal (см. app/providers.tsx), залогиненный — просто
// выполнит действие.
export function useRequireAuth() {
  const user = useStore(s => s.user)
  const openAuthGate = useStore(s => s.openAuthGate)
  return {
    isGuest: !user,
    requireAuth: (fn: () => void) => {
      if (!user) { openAuthGate(); return }
      fn()
    },
  }
}
