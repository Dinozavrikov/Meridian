// Безопасно рендерит description/text-поля, которые раньше были голым текстом, а после
// rich-text rollout стали HTML. Строка с тегом считается HTML и ОБЯЗАТЕЛЬНО проходит
// sanitizeHtml (lib/sanitize-html.ts): через API в эти поля можно записать что угодно, а показ
// идёт и чужим людям. Легаси голый текст экранируется, переносы строк становятся <br />.
// Эвристика не идеальна (случайный "<b>" в легаси-тексте будет принят за тег), но это лучшее,
// что можно сделать без хранения отдельного флага "это уже HTML".
import { resolveHtmlImages } from "@/lib/api"
import { escapeHtml, sanitizeHtml } from "@/lib/sanitize-html"

const HTML_TAG_RE = /<[a-z][\s\S]*>/i

export function renderableHtml(raw: string | null | undefined): string {
  if (!raw) return ""
  if (HTML_TAG_RE.test(raw)) return resolveHtmlImages(sanitizeHtml(raw))
  return escapeHtml(raw).replace(/\n/g, "<br />")
}
