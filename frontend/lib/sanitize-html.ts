import createDOMPurify from "dompurify"

/** Экранирование текста для вставки в HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Пользовательский HTML (text/description/body записей — rich-text, но через API туда можно
// записать что угодно) показывается через dangerouslySetInnerHTML, в том числе чужим людям
// (публичные записи, лабы). Санитизация — при показе, а не при записи: так защищены и уже
// сохранённые данные. Все места показа идут через renderableHtml()/sanitizeHtml(), это
// охраняет lib/html-sinks.test.ts.

// Схемы DOMPurify по умолчанию + meridian:// (внутренние ссылки на записи, по ним работают
// переходы из текста). javascript:, data: и прочее в href/src вырезается.
const ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|meridian):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

// Формы и кнопки — фишинг внутри чужой записи; <style> перекрывает интерфейс.
const FORBID_TAGS = ["style", "form", "input", "button", "textarea", "select", "option", "iframe", "object", "embed", "link", "meta", "base"]

// style="…" допускаем только для оформления текста: position/z-index/url() дали бы наложение
// поддельного интерфейса поверх страницы.
const SAFE_STYLE_PROPS = new Set(["color", "background-color", "text-align", "font-weight", "font-style", "text-decoration", "text-decoration-line"])
const UNSAFE_STYLE_VALUE = /url\(|expression\(|javascript:|@import|\\|\/\*/i

export function filterStyle(css: string): string {
  return css.split(";").map(d => d.trim()).filter(d => {
    const i = d.indexOf(":")
    if (i < 1) return false
    const prop = d.slice(0, i).trim().toLowerCase()
    return SAFE_STYLE_PROPS.has(prop) && !UNSAFE_STYLE_VALUE.test(d.slice(i + 1))
  }).join("; ")
}

type Purifier = typeof createDOMPurify
let purifier: Purifier | null = null

// Свой экземпляр, а не глобальный DOMPurify: хуки не копятся при HMR и не задевают чужой код.
function getPurifier(): Purifier | null {
  if (typeof window === "undefined") return null
  if (purifier) return purifier
  const p = createDOMPurify(window as never)
  if (!p.isSupported) return null
  p.addHook("afterSanitizeAttributes", node => {
    const el = node as Element
    if (typeof el.hasAttribute !== "function") return
    if (el.hasAttribute("style")) {
      const safe = filterStyle(el.getAttribute("style") ?? "")
      if (safe) el.setAttribute("style", safe)
      else el.removeAttribute("style")
    }
    if (el.hasAttribute("target")) {
      // только _blank и только с rel: иначе открытая страница получает window.opener
      if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer")
      else el.removeAttribute("target")
    }
  })
  purifier = p
  return p
}

export function sanitizeHtml(raw: string): string {
  const p = getPurifier()
  // Нет DOM (серверный рендер): отдаём только экранированный текст. Сырой HTML наружу не идёт.
  if (!p) return escapeHtml(raw.replace(/<[^>]*>/g, ""))
  return p.sanitize(raw, { ALLOWED_URI_REGEXP: ALLOWED_URI, FORBID_TAGS, ADD_ATTR: ["target"] })
}
