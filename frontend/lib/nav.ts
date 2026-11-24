import {
  Eye, Lightbulb, TrendingUp, Globe, HelpCircle,
  CheckSquare, Network, BarChart2, Scale, Rss, FlaskConical,
  MessageCircle, Trash2, LayoutDashboard, Info, type LucideIcon,
} from "lucide-react"
import { typeColor, v2 } from "@/lib/theme"

// ЕДИНЫЙ источник пунктов навигации: верхнее меню (header.tsx / nav-menu.tsx)
// и боковая панель (sidebar.tsx) читают отсюда. Новый раздел добавляется
// только здесь — иначе меню снова разойдутся (так в верхнем не оказалось корзины).

export type NavItem = {
  href: string
  labelKey: string
  icon: LucideIcon
  /** Цвет при наведении и на активном пункте. Типы записей — их цвет из typeColor (как на карточках
   *  и фильтрах), прочие разделы — акцентный бирюзовый. В покое иконка нейтральная. Своих цветов не выдумываем. */
  color: string
  /** Запись (наблюдение, гипотеза и т.д.): в покое иконка слегка подкрашена цветом типа.
   *  У прочих разделов (инструменты) в покое нейтральная. */
  entity?: boolean
  /** Какой счётчик непрочитанного вешать на иконку в сайдбаре (см. sidebar.tsx). */
  unreadKey?: "feed" | "labs" | "messages"
  /** Только выпадающее меню: нарисовать разделитель перед пунктом. */
  dividerBefore?: boolean
}

export type NavGroup = {
  id: "data" | "analysis" | "community"
  labelKey: string
  items: NavItem[]
}

export const DASHBOARD_ITEM: NavItem = {
  href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, color: v2.teal,
}

/** Выход на главную страницу сайта: нижний блок боковой панели и мобильное меню. Отдельно от NAV_GROUPS: это не раздел приложения. */
export const ABOUT_ITEM: NavItem = {
  href: "/", labelKey: "sidebar.about", icon: Info, color: v2.teal,
}

export const TRASH_ITEM: NavItem = {
  href: "/trash", labelKey: "nav.trash", icon: Trash2, color: v2.red,
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "data", labelKey: "nav.data.group",
    items: [
      { href: "/observations", labelKey: "nav.data.observations", icon: Eye,        color: typeColor.observation, entity: true },
      { href: "/hypotheses",   labelKey: "nav.data.hypotheses",   icon: Lightbulb,  color: typeColor.hypothesis, entity: true },
      { href: "/predictions",  labelKey: "nav.data.predictions",  icon: TrendingUp, color: typeColor.prediction, entity: true },
      { href: "/worldview",    labelKey: "nav.data.worldview",    icon: Globe,      color: typeColor.worldview, entity: true },
      { href: "/questions",    labelKey: "nav.data.questions",    icon: HelpCircle, color: typeColor.question, entity: true },
    ],
  },
  {
    id: "analysis", labelKey: "nav.analysis.group",
    items: [
      { href: "/tasks",  labelKey: "nav.analysis.tasks",  icon: CheckSquare, color: typeColor.task, entity: true },
      { href: "/graph",  labelKey: "nav.analysis.graph",  icon: Network,     color: v2.teal },
      { href: "/stats",  labelKey: "nav.analysis.stats",  icon: BarChart2,   color: v2.teal },
      { href: "/scales", labelKey: "nav.analysis.scales", icon: Scale,       color: v2.teal },
    ],
  },
  {
    id: "community", labelKey: "nav.community.group",
    items: [
      { href: "/feed",     labelKey: "nav.community.feed",     icon: Rss,           color: v2.teal, unreadKey: "feed" },
      { href: "/labs",     labelKey: "nav.community.labs",     icon: FlaskConical,  color: typeColor.lab, entity: true, unreadKey: "labs" },
      { href: "/messages", labelKey: "nav.community.messages", icon: MessageCircle, color: v2.teal, unreadKey: "messages" },
    ],
  },
]

// Верхнее меню: корзина — последней строкой группы «Данные», под разделителем
// (в сайдбаре она остаётся отдельной секцией внизу списка).
export const HEADER_GROUPS: NavGroup[] = NAV_GROUPS.map(g =>
  g.id === "data" ? { ...g, items: [...g.items, { ...TRASH_ITEM, dividerBefore: true }] } : g,
)

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}

// Цвет иконки в покое: запись — цвет типа, смешанный с нейтральным серым (мягкий, не кричащий);
// инструмент — чистый серый. На наведении и у активного пункта берётся item.color целиком.
const REST_TINT = 0.55
function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const out = [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))
  return "#" + out.map(v => v.toString(16).padStart(2, "0")).join("")
}
export function restColor(item: NavItem): string {
  return item.entity ? mixHex(v2.t3, item.color, REST_TINT) : v2.t3
}

// Размеры меню (px). Рейка — единственный источник ширины для sidebar.tsx и спейсера в app-shell.tsx.
export const RAIL_WIDTH = 44
export const SIDEBAR_TILE = 34   // плитка иконки в рейке (должна быть меньше RAIL_WIDTH)
export const SIDEBAR_ICON = 19
export const MENU_TILE = 26      // плитка в выпадающем меню
export const MENU_ICON = 16
