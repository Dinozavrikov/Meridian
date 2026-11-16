import hljs from "highlight.js/lib/core"
import type { LanguageFn } from "highlight.js"

export interface EntityAttachment {
  id: number
  user_id: number
  entity_type: string
  entity_id: number
  kind: string
  filename: string
  mime_type: string
  size_bytes: number
  language: string | null
  has_text_content: boolean
  download_url: string
  created_at: string
}

export interface EntityAttachmentDetail extends EntityAttachment {
  text_content: string | null
}

export interface EntityAttachmentVersion {
  id: number
  attachment_id: number
  filename: string
  mime_type: string
  size_bytes: number
  language: string | null
  has_text_content: boolean
  superseded_at: string
  download_url: string
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string

/** Синхронно с backend/app/services/attachment_storage.py::MAX_ATTACHMENT_SIZE
 * (проверяется тестом lib/attachments.test.ts). Только для подсказки в UI —
 * реальный отказ по размеру всегда выдаёт сервер. */
export const MAX_ATTACHMENT_MB = 10

/** Выше этого размера подсветку не делаем: highlight.js синхронный, на очень
 * большом файле он подвесил бы вкладку. Такой файл показывается простым текстом. */
export const MAX_HIGHLIGHT_CHARS = 100_000

export function formatFileSize(bytes: number, t: TFn): string {
  if (bytes < 1024) return t("attachmentsTab.sizeB", { n: bytes })
  if (bytes < 1024 * 1024) return t("attachmentsTab.sizeKb", { n: Number((bytes / 1024).toFixed(1)) })
  return t("attachmentsTab.sizeMb", { n: Number((bytes / (1024 * 1024)).toFixed(1)) })
}

// Значения EntityAttachment.language, которые отдаёт бэкенд (CODE_EXTENSIONS /
// CODE_FILENAMES в attachment_storage.py) -> имя языка highlight.js. Языки
// грузятся динамически по одному, в бандл не попадают все сразу. Покрытие
// бэкенда проверяет тест lib/attachments.test.ts.
const LANGUAGE_ALIASES: Record<string, string> = { tsx: "typescript", jsx: "javascript", toml: "ini" }

const LOADERS: Record<string, () => Promise<{ default: LanguageFn }>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  python: () => import("highlight.js/lib/languages/python"),
  json: () => import("highlight.js/lib/languages/json"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  sql: () => import("highlight.js/lib/languages/sql"),
  bash: () => import("highlight.js/lib/languages/bash"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  java: () => import("highlight.js/lib/languages/java"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  php: () => import("highlight.js/lib/languages/php"),
  css: () => import("highlight.js/lib/languages/css"),
  lua: () => import("highlight.js/lib/languages/lua"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  swift: () => import("highlight.js/lib/languages/swift"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
}

// Синхронизировано с backend/app/services/attachment_storage.py::VALID_LANGUAGES
// (проверяется тестом lib/attachments.test.ts) — используется в <select> при
// редактировании текста вложения (PUT .../text). LOADERS — канонические имена,
// LANGUAGE_ALIASES — их синонимы (tsx/jsx/toml), сервер принимает и то, и другое.
export const CODE_LANGUAGE_OPTIONS: string[] =
  [...new Set([...Object.keys(LOADERS), ...Object.keys(LANGUAGE_ALIASES)])].sort()

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

/** HTML с подсветкой или null (язык неизвестен / слишком большой текст).
 * highlight.js сам экранирует исходный текст (&, <, >, кавычки), поэтому
 * результат можно вставлять через dangerouslySetInnerHTML — это защищено
 * тестом на <script> внутри строки кода. Содержимое файла — недоверенное. */
export async function highlightToHtml(code: string, language: string | null): Promise<string | null> {
  if (!language || code.length > MAX_HIGHLIGHT_CHARS) return null
  const name = has(LANGUAGE_ALIASES, language) ? LANGUAGE_ALIASES[language] : language
  if (!has(LOADERS, name)) return null
  if (!hljs.getLanguage(name)) {
    const mod = await LOADERS[name]()
    const def = (mod as { default?: LanguageFn }).default ?? (mod as unknown as LanguageFn)
    hljs.registerLanguage(name, def)
  }
  return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
}
