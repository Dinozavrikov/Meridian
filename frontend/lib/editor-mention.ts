import { Extension, type JSONContent } from "@tiptap/react"
import { PluginKey } from "@tiptap/pm/state"
import { Suggestion, exitSuggestion, type SuggestionProps } from "@tiptap/suggestion"
import { api } from "@/lib/api"

/** Вставка внутренней ссылки по «@»: список записей рядом с курсором. Ссылка хранится как href="meridian://тип/id"
 *  (её разбирает parseEntityHref на фронте и extract_mentions на бэке). */
export type MentionItem = { type: string; id: number; title: string }
export type MentionUi = { items: MentionItem[]; loading: boolean; command: (item: MentionItem) => void; rect: DOMRect | null }
export interface MentionHandlers {
  show: (s: MentionUi) => void
  hide: () => void
  keydown: (e: KeyboardEvent) => boolean
}

const KEY = new PluginKey("entityMention")
const MAX_ITEMS = 8

export async function searchMentions(query: string, signal?: AbortSignal): Promise<MentionItem[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const r = await api.get("/api/v1/graph/search", { params: { q }, signal })
    return (r.data as any[]).slice(0, MAX_ITEMS).map(x => ({ type: String(x.type), id: Number(x.id), title: String(x.title ?? "") }))
  } catch { return [] }
}

/** Текстовый узел с меткой ссылки, а не HTML-строка: заголовок записи не должен превращаться в разметку. */
export const mentionContent = (it: MentionItem): JSONContent[] => [
  { type: "text", text: it.title || `${it.type}/${it.id}`, marks: [{ type: "link", attrs: { href: `meridian://${it.type}/${it.id}` } }] },
  { type: "text", text: " " },
]

const toUi = (p: SuggestionProps<MentionItem, MentionItem>): MentionUi =>
  ({ items: p.items, loading: p.loading, command: p.command, rect: p.clientRect?.() ?? null })

export function createMentionExtension(ui: MentionHandlers) {
  return Extension.create({
    name: "entityMention",
    addProseMirrorPlugins() {
      return [
        Suggestion<MentionItem, MentionItem>({
          editor: this.editor, pluginKey: KEY, char: "@", minQueryLength: 1, debounce: 150,
          items: ({ query, signal }) => searchMentions(query, signal),
          command: ({ editor, range, props }) => { editor.chain().focus().insertContentAt(range, mentionContent(props)).run() },
          render: () => ({
            onStart: p => ui.show(toUi(p)),
            onUpdate: p => ui.show(toUi(p)),
            onExit: () => ui.hide(),
            onKeyDown: ({ view, event }) => {
              if (event.key === "Escape") { exitSuggestion(view, KEY); return true }
              return ui.keydown(event)
            },
          }),
        }),
      ]
    },
  })
}

/** Ctrl/Cmd+K открывает окно ссылки. Латинский K срабатывает на любой раскладке (в том числе Dvorak), на нелатинских
 *  (русская: key = «л») решает физическая клавиша. На Dvorak физическое QWERTY-K даёт «t» и не перехватывается. */
export function isLinkShortcut(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey">): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false
  if (e.key.toLowerCase() === "k") return true
  return e.code === "KeyK" && !/^[a-z]$/i.test(e.key)
}
