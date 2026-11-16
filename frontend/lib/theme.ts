import React from "react"
import { readableOn } from "@/lib/color"
import { TYPE_COLORS, TYPE_RU } from "@/lib/utils"

// ── Design Tokens ──────────────────────────────────────────────────────────
// Meridian Dark — собственный язык без границ, пространство = иерархия
export const theme = {
  // фоны — три уровня глубины
  bg0:     "#080a10",   // самый тёмный — подложка
  bg1:     "#0b0d14",   // основной фон панелей
  bg2:     "#111420",   // поднятые элементы
  bg3:     "#161928",   // hover, активные состояния
  bg4:     "#1c2030",   // выбранные элементы

  // текст — четыре уровня
  tx1:     "#e2e0db",   // заголовки, важное
  tx2:     "#b4b9d2",   // основной текст
  tx3:     "#8b92b5",   // вспомогательный
  tx4:     "#7f86ab",   // placeholder, неактивное

  // границы — минимальные, только там где нужно
  ln1:     "#ffffff08",  // еле видимые разделители
  ln2:     "#ffffff12",  // чуть заметнее

  // акцент
  accent:  "#4A90D9",
  /** нейтральная связь «связано» — холодный серый, не спорит с акцентом */
  edgeNeutral: "#8892A6",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
}

// ── Meridian v2 — единая палитра дашборда ──────────────────────────────────
export const v2 = {
  bg:      "#0b0d14",
  surf:    "#111420",
  surf2:   "#161928",
  bd:      "rgba(255,255,255,0.07)",
  bd2:     "rgba(255,255,255,0.13)",
  t1:      "#f2efe9",
  t2:      "rgba(242,239,233,0.65)",
  t3:      "#8b92b5",
  t4:      "#7f86ab",
  teal:    "#4dcfa6",
  amber:   "#e8a84e",
  red:     "#e05b5b",
  violet:  "#8b80f0",
  fontSans: "'Inter', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fontSerif: "var(--font-serif), Newsreader, Georgia, serif",
}

// ── Цвета типов сущностей ──────────────────────────────────────────────────
// Источник — lib/utils.ts: здесь тот же объект, а не копия (охраняет lib/type-colors.test.ts).
export const typeColor = TYPE_COLORS

export const typeRu = TYPE_RU

// ── Статусы ────────────────────────────────────────────────────────────────
export const statusColor: Record<string, string> = {
  "открыт":                  "#4A90D9",
  "исследуется":             "#F5A623",
  "отвечен":                 "#27AE60",
  "отложен":                 "#484848",
  "отклонён":                "#E74C3C",
  "открыта":                 "#4A90D9",
  "приостановлена":          "#F5A623",
  "решена":                  "#27AE60",
  "закрыта":                 "#333333",
  "идея":                    "#606060",
  "активная проверка":       "#4A90D9",
  "ожидание данных":         "#F5A623",
  "заморожена":              "#484848",
  "отвергнута":              "#E74C3C",
  "частично подтверждена":   "#2ECC71",
  "подтверждается":          "#27AE60",
  "подтвердилось":            "#27AE60",
  "требует пересмотра":      "#9B59B6",
  "не проверен":             "#484848",
  "подтвердился":            "#27AE60",
  "частично подтвердился":   "#2ECC71",
  "не подтвердился":         "#E74C3C",
  "гипотеза":                "#606060",
  "частично подтверждается": "#2ECC71",
  "пересматривается":        "#F5A623",
  "отвергнуто":              "#E74C3C",
  // Наблюдения
  "сырое":                   "#606080",
  "осмысленное":             "#1ABC9C",
  "интегрированное":         "#4A90D9",
  "архивное":                "#484848",
}

// ── Status Badge ────────────────────────────────────────────────────────────
export function statusBadge(status: string) {
  const color = statusColor[status] ?? "#484848"
  return {
    display: "inline-flex", alignItems: "center",
    fontSize: 12, padding: "3px 10px", borderRadius: 6,
    background: `${color}14`, color,
    border: `1px solid ${color}28`,
    fontWeight: 600, letterSpacing: "0.03em", whiteSpace: "nowrap",
  } as React.CSSProperties
}

// ── Detail Panel Header ────────────────────────────────────────────────────
// Шапка детальной панели — без внешних границ, разделение через фон
export function detailHeader(accent: string) {
  return {
    background: `linear-gradient(180deg, ${accent}08 0%, ${theme.bg1} 100%)`,
    flexShrink: 0,
  } as React.CSSProperties
}

// Строка мета (статус + дата + действия)
export function detailMeta(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px 12px",
    borderBottom: `1px solid ${theme.ln1}`,
  }
}

// Заголовок сущности
export function detailTitle(): React.CSSProperties {
  return {
    fontSize: 22, fontWeight: 700,
    color: theme.tx1,
    lineHeight: 1.25,
    margin: "0 0 8px",
    letterSpacing: "-0.03em",
  }
}

// Блок с заголовком
export function detailTitleBlock(): React.CSSProperties {
  return { padding: "14px 24px 12px" }
}

// Вкладки
export function detailTabBar(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center",
    borderTop: `1px solid ${theme.ln1}`,
    padding: "0 16px",
    background: theme.bg0,
    gap: 0, overflowX: "auto",
    // скрываем скроллбар
    scrollbarWidth: "none",
  }
}

export function detailTab(isActive: boolean, accent: string): React.CSSProperties {
  return {
    padding: "11px 14px",
    fontSize: 12, fontWeight: 400,
    color: isActive ? accent : theme.tx3,
    border: "none",
    background: isActive ? accent + "0e" : "transparent",
    cursor: "pointer",
    borderBottom: `2px solid ${isActive ? accent : "transparent"}`,
    borderRadius: "6px 6px 0 0",
    marginBottom: -1,
    transition: "color 0.12s, background 0.12s",
    whiteSpace: "nowrap",
  }
}

// Контент-зона
export function detailContent(): React.CSSProperties {
  return {
    flex: 1, overflowY: "auto", overflowX: "hidden",
    padding: "24px 28px",
  }
}

// Разделитель-фейд (без линии — только пространство с градиентным отступом)
export function detailDivider(): React.CSSProperties {
  return {
    height: 1,
    background: `linear-gradient(90deg, transparent, ${theme.ln2} 20%, ${theme.ln2} 80%, transparent)`,
    margin: "20px 0",
    border: "none",
    flexShrink: 0,
  }
}

// ── List Panel ─────────────────────────────────────────────────────────────
// Левая колонка списка — без рамки, разница фонов
export function listPanel(): React.CSSProperties {
  return {
    background: "#0b0d14",
    height: "100%",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    borderRight: "1px solid #1E2236",
  }
}

// Элемент списка
export function listItem(isActive: boolean, isHov: boolean, accent: string): React.CSSProperties {
  return {
    padding: "12px 14px",
    cursor: "pointer",
    borderLeft: `3px solid ${isActive ? accent : "transparent"}`,
    background: isActive ? `${accent}14` : isHov ? "#141829" : "transparent",
    boxShadow: isActive ? `inset 0 0 0 1px ${accent}33` : "none",
    transition: "background 0.1s, border-color 0.1s",
    margin: "0 8px 4px",
    borderRadius: 10,
  }
}

// ── Поиск ──────────────────────────────────────────────────────────────────
export function sectionSearch(accent = "#4A90D9"): React.CSSProperties {
  void accent
  return {
    width: "100%",
    background: "transparent",
    border: "none",
    borderRadius: 0,
    padding: "10px 12px 10px 38px",
    fontSize: 13, color: "#d6d9ec",
    outline: "none",
  }
}

export function sectionSearchWrap(): React.CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    margin: "10px 12px 6px",
    borderRadius: 10,
    background: "#10131f",
    border: "1px solid #262b42",
    overflow: "hidden",
  }
}

// ── Прочие helpers (обратная совместимость) ────────────────────────────────
export function mono(color = "#505060", size = 11): React.CSSProperties {
  return { fontFamily: theme.mono, fontSize: size, color, letterSpacing: "-0.02em" }
}

export function tag(color = "#4A90D9"): React.CSSProperties {
  return {
    fontSize: 12, padding: "3px 9px", borderRadius: 6,
    background: `${color}1f`, color: readableOn(color),
    border: `1px solid ${color}40`, fontWeight: 500,
  }
}

export const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700,
  letterSpacing: "0.12em", textTransform: "uppercase",
  color: "#848cb0", padding: "8px 16px 4px",
}

export function glowStyle(color: string): React.CSSProperties {
  return { boxShadow: `0 0 0 1px ${color}20, 0 4px 24px ${color}10` }
}

export function entityCard(accent: string, hov = false): React.CSSProperties {
  return {
    position: "relative",
    background: hov ? theme.bg3 : theme.bg2,
    border: "none",
    borderLeft: `2px solid ${accent}`,
    borderRadius: 8, padding: "12px 16px",
    transition: "background 0.15s",
    cursor: "default",
  }
}

export function filterBtn(active: boolean, color = "#4A90D9"): React.CSSProperties {
  return {
    fontSize: 11, padding: "4px 12px", borderRadius: 4,
    border: `1px solid ${active ? color + "40" : theme.ln2}`,
    background: active ? `${color}14` : "transparent",
    color: active ? color : theme.tx3,
    cursor: "pointer", transition: "all 0.15s",
    fontWeight: active ? 600 : 400,
  }
}

export function pageHeaderTitle(): React.CSSProperties {
  return {
    fontSize: 17, fontWeight: 700, color: theme.tx1,
    letterSpacing: "-0.01em",
    display: "flex", alignItems: "center", gap: 10,
  }
}

export function pageHeaderIcon(color = "#4A90D9"): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 8,
    background: `${color}14`,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  }
}

export function pageHeaderBar(color = "#4A90D9"): React.CSSProperties {
  return {
    height: 52, borderBottom: `1px solid ${theme.ln1}`,
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    background: theme.bg1,
    position: "sticky", top: 0, zIndex: 10,
    boxShadow: `inset 0 -1px 0 ${color}18`,
  }
}

export function listItemTitle(active: boolean): React.CSSProperties {
  return {
    fontSize: 14, fontWeight: active ? 600 : 500,
    color: active ? theme.tx1 : "#d6d9ec",
    lineHeight: 1.4, marginBottom: 4,
    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
  }
}

export function listItemPreview(): React.CSSProperties {
  return {
    fontSize: 12, color: "#848cb0", lineHeight: 1.5,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }
}

export function listItemDate(): React.CSSProperties {
  return {
    fontSize: 12, color: "#848cb0",
    fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em",
  }
}

// ── Меридиан: единый формат даты/времени "штамп журнала наблюдений" ────────
const HAS_TZ = /(Z|[+-]\d{2}(:?\d{2})?)$/i

/** Парсит ISO-строку (created_at с бэкенда) или "YYYY-MM-DD" в Date */
export function parseEntityDate(raw?: string): Date | null {
  if (!raw) return null
  // Наивная дата-время (без Z и без смещения) — это UTC бэкенда. Строки со смещением
  // ("+00:00", "+03:00" — так отдаёт isoformat() aware-datetime, в том числе Event.meta)
  // раньше получали лишнее "Z" и превращались в Invalid Date.
  const iso = raw.includes("T") && !HAS_TZ.test(raw) ? raw + "Z" : raw
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]

/** "ru" -> "ru-RU" для Intl; остальные локали (сейчас только "en") передаются как есть. */
export function toIntlLocale(locale: string): string {
  return locale === "ru" ? "ru-RU" : locale
}

/** "21 июн · 14:32" — компактный штамп для списков.
 *  locale берётся из стора (useStore(s => s.locale)) вызывающим кодом —
 *  без параметра функция молча оставалась бы всегда русской, даже когда
 *  весь остальной интерфейс уже переключён на другой язык. */
export function formatEntityStamp(raw?: string, locale: string = "ru"): { day: string; time: string } | null {
  const d = parseEntityDate(raw)
  if (!d) return null
  const intlLocale = toIntlLocale(locale)
  const day = locale === "ru"
    ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
    : d.toLocaleDateString(intlLocale, { day: "numeric", month: "short" })
  return {
    day,
    time: d.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit", hour12: false }),
  }
}

/** "21 июня 2026 · 14:32" — полный штамп для шапки детальной карточки */
export function formatEntityStampFull(raw?: string, locale: string = "ru"): string | undefined {
  const d = parseEntityDate(raw)
  if (!d) return undefined
  const intlLocale = toIntlLocale(locale)
  const day = d.toLocaleDateString(intlLocale, { day: "numeric", month: "long", year: "numeric" }).replace(" г.", "")
  const time = d.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${day} · ${time}`
}

// ── Читаемые служебные цвета ───────────────────────────────────────────────
// Старые служебные цвета (#3A3F5C, tx3/tx4 и т.п.) давали контраст около 2:1 и были нечитаемы.
// Всё, что человек должен прочитать (подписи, второстепенный текст), берёт цвет отсюда;
// минимум 4.5:1 на bg1/bg2/card проверяет lib/theme-contrast.test.ts.
export const ink = {
  label: "#9aa1c2",   // подписи шкал, заголовки секций, вкладки
  muted: "#848cb0",   // второстепенный текст, пустые состояния
  line:  "#262b42",   // разделители и контуры (декоративные, читать их не нужно)
  well:  "#10131f",   // утопленная поверхность: треки, поля
  card:  "#141829",   // карточка паспорта
}
