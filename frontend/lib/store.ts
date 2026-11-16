import { create } from "zustand"

export interface User {
  id: number
  username: string
  email: string
  display_name: string
  bio: string
  is_verified: boolean
  onboarding_completed: boolean
  onboarding_step: number
  default_visibility: string
  avatar_url: string | null
}

interface AppStore {
  user: User | null
  setUser: (u: User | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
  compactListWidth: number
  setCompactListWidth: (v: number) => void
  locale: string
  setLocale: (v: string) => void
  // Что переводить помимо интерфейса — сама логика перевода чужого контента
  // ещё не реализована, это пока только состояние выбора режима в UI
  // переключателя (LocaleSwitcher). Дефолт "ui" = ровно то, что сайт и так
  // всегда делал до появления этого поля.
  translationScope: "ui" | "ui_and_content" | "content"
  setTranslationScope: (v: "ui" | "ui_and_content" | "content") => void
  translations: Record<string, string>
  setTranslations: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void
  dynamicTranslations: Record<string, string>
  mergeDynamicTranslations: (v: Record<string, string>) => void
  resetDynamicTranslations: () => void
  // Второй, независимый кэш переводов — для пользовательского контента
  // (useContentT), ключи вида "entity_type:entity_id:field", а не сам текст
  // (в отличие от dynamicTranslations/useDynamicT — см. докстринг useDynamicT.ts).
  contentTranslations: Record<string, string>
  mergeContentTranslations: (v: Record<string, string>) => void
  resetContentTranslations: () => void
  // Модалка "эта страница только для зарегистрированных" — открывается
  // глобально из QueryCache.onError (см. app/providers.tsx) при 403 у
  // гостя, чтобы не дублировать обработку в каждом компоненте отдельно.
  authGateOpen: boolean
  openAuthGate: () => void
  closeAuthGate: () => void
}

function getInitialLocale(): string {
  if (typeof window === "undefined") return "ru"
  // Стартовый язык — всегда язык браузера (никакого сохранённого выбора):
  // человек мог сменить язык системы/браузера и ожидает, что интерфейс
  // подхватит это сам при новой загрузке.
  //
  // Две политики по группам страниц:
  //  - (app): LocaleSwitcher может переопределить язык на текущую сессию
  //    через setLocale; выбор не переживает перезагрузку (новый старт —
  //    снова язык браузера).
  //  - (auth): (auth)/layout.tsx форсит язык браузера при каждом монтировании
  //    (useForceBrowserLocale), чтобы вышедший из аккаунта пользователь видел
  //    форму входа на языке своей системы, а не на языке, который он выбрал
  //    внутри аккаунта.
  return (navigator.language || "ru").slice(0, 2).toLowerCase()
}

export const useStore = create<AppStore>(set => ({
  user: null,
  setUser: u => set({ user: u }),
  sidebarOpen: true,
  setSidebarOpen: v => set({ sidebarOpen: v }),
  searchOpen: false,
  setSearchOpen: v => set({ searchOpen: v }),
  compactListWidth: 340,
  setCompactListWidth: v => set({ compactListWidth: v }),
  locale: getInitialLocale(),
  setLocale: v => set({ locale: v }),
  translationScope: "ui",
  setTranslationScope: v => set({ translationScope: v }),
  translations: {},
  setTranslations: v => set(s => ({ translations: typeof v === "function" ? v(s.translations) : v })),
  dynamicTranslations: {},
  mergeDynamicTranslations: v => set(s => ({ dynamicTranslations: { ...s.dynamicTranslations, ...v } })),
  resetDynamicTranslations: () => set({ dynamicTranslations: {} }),
  contentTranslations: {},
  mergeContentTranslations: v => set(s => ({ contentTranslations: { ...s.contentTranslations, ...v } })),
  resetContentTranslations: () => set({ contentTranslations: {} }),
  authGateOpen: false,
  openAuthGate: () => set({ authGateOpen: true }),
  closeAuthGate: () => set({ authGateOpen: false }),
}))
