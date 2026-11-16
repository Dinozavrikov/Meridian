// Работа с цветом: контраст по WCAG 2.x и подбор читаемого оттенка. Нужно там, где цвет приходит
// из данных (цвета статусов в theme.ts, цвета типов), а не из проверенной палитры.
const HEX = /^#[0-9a-f]{6}$/i

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Относительная яркость sRGB (0 — чёрный, 1 — белый). */
export function luminance(hex: string): number {
  const ch = channels(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** Контраст двух цветов: (L1 + 0.05) / (L2 + 0.05), от 1 до 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Смешивает два цвета: t=0 — a, t=1 — b. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = channels(a)
  const cb = channels(b)
  return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0")).join("")
}

/** Цвет, читаемый на фоне bg (по умолчанию — фон панелей): подмешивает белый, пока контраст
 *  не дойдёт до min. Уже читаемый цвет остаётся прежним. Не-hex значения возвращает как есть. */
export function readableOn(color: string, bg = "#0b0d14", min = 4.5): string {
  if (!HEX.test(color) || !HEX.test(bg)) return color
  for (let i = 0; i <= 20; i++) {
    const c = mixHex(color, "#ffffff", i / 20)
    if (contrastRatio(c, bg) >= min) return c
  }
  return "#ffffff"
}

/** "rgb(26, 188, 156)" (так браузер и jsdom отдают computed/style цвет) -> "#1abc9c"; иначе null. */
export function cssRgbToHex(css: string): string | null {
  const m = css.match(/\d+/g)
  if (!m || m.length < 3) return null
  return "#" + m.slice(0, 3).map(v => Number(v).toString(16).padStart(2, "0")).join("")
}

/** Цвет #rgb / #rgba / #rrggbb / #rrggbbaa поверх фона -> непрозрачный #rrggbb; не hex -> null. */
export function resolveOnBg(css: string, bg = "#0b0d14"): string | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css.trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length <= 4) h = h.split("").map(c => c + c).join("")
  const base = "#" + h.slice(0, 6)
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return a === 1 ? base : mixHex(bg, base, a)
}

/**
 * «Тусклый текст»: серый или сине-серый цвет, который на тёмном фоне не читается (контраст < 4.5:1).
 * Почти чёрные цвета (яркость < 0.012) не считаем: так красят текст на яркой заливке (кнопки, плашки).
 * Насыщенные цвета тоже: это акценты, а не серые подписи.
 */
export function isDimTextColor(css: string, bg = "#0b0d14"): boolean {
  const hex = resolveOnBg(css, bg)
  if (!hex) return false
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return contrastRatio(hex, bg) < DIM_TEXT_MIN && luminance(hex) >= 0.012 && Math.max(r, g, b) - Math.min(r, g, b) <= 80
}

/** Ниже этого контраста серый текст на тёмном фоне считаем тусклым (мелкий шрифт требует запаса над 4.5). */
export const DIM_TEXT_MIN = 5.5
