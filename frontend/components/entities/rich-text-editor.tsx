"use client"
// Rich-редактор пользовательского контента — изначально писался только под
// Result (см. историю в git), обобщён под другие entity_type (Этап 8,
// 18.08: наблюдения/прогнозы получают тот же тулбар). Единственное место,
// где раньше был захардкожен "result" — imageApi.upload — теперь параметр
// entityType. Остальное уже было полностью общим (внутренний линк-пикер
// meridian://{type}/{id} никогда не был result-специфичным).
// Два расширения поверх обычного тулбара:
// 1. Вставка ссылки на любую запись лабы (не только внешний URL) — ссылка
//    хранится как href="meridian://{type}/{id}", это не настоящий URL, а
//    маркер: его разбирает parseEntityHref (lib/entity-routes), а при чтении
//    текста (RichHtml) наведение показывает карточку записи, клик закрепляет её.
//    Выделенный текст становится якорем; без выделения —
//    вставляется заголовок сущности как текст ссылки. "Безанкорная" ссылка —
//    когда пользователь вручную стирает текст, оставляя только сам тег (тот
//    же href без видимого текста); специального режима под это не делаем,
//    редактор такое допускает как обычное поведение contenteditable.
// 2. Вставка изображения по месту курсора — если entityId ещё нет (черновик
//    не сохранён), вставляется временный blob:-превью и файл откладывается
//    через onPendingFileAdded; реальная загрузка и подмена src на серверный
//    URL происходит после первого сохранения (см. ResultForm/LabResultsTab —
//    тот же паттерн повторяется в ObservationForm/PredictionForm для observation/prediction).
// 3. Ресайз вставленных картинок — перетаскиванием хендла в правом нижнем
//    углу (виден когда картинка выделена кликом). Ширина хранится как атрибут
//    width на самом <img> (см. ResizableImage ниже) — переживает
//    сериализацию в HTML и обратный парсинг при перезагрузке контента.
import { useEffect, useState, useRef } from "react"
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TiptapLink from "@tiptap/extension-link"
import TiptapImage from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import { useQuery } from "@tanstack/react-query"
import { Link2, Image as ImageIcon, Search } from "lucide-react"
import { api, imageApi, resolveMediaUrl } from "@/lib/api"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { createMentionExtension, isLinkShortcut, type MentionUi } from "@/lib/editor-mention"

const ACCENT = "#4A90D9"

function LinkPickerPopover({ onPick, onClose }: { onPick: (href: string, title: string) => void; onClose: () => void }) {
  const t = useT()
  const [q, setQ] = useState("")
  const [mode, setMode] = useState<"internal" | "external">("internal")
  const [externalUrl, setExternalUrl] = useState("")
  const { data: results = [] } = useQuery({
    queryKey: ["link-search", q],
    queryFn: () => api.get(`/api/v1/graph/search`, { params: { q } }).then(r => r.data),
    enabled: mode === "internal" && q.length > 0,
  })
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, width: 320, background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 10, padding: 10, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={() => setMode("internal")}
          style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: mode === "internal" ? `${ACCENT}20` : "transparent", color: mode === "internal" ? ACCENT : v2.t3 }}>
          {t("results.linkInternal")}
        </button>
        <button type="button" onClick={() => setMode("external")}
          style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: mode === "external" ? `${ACCENT}20` : "transparent", color: mode === "external" ? ACCENT : v2.t3 }}>
          {t("results.linkExternal")}
        </button>
      </div>
      {mode === "internal" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: `1px solid ${v2.bd2}`, borderRadius: 7, marginBottom: 6 }}>
            <Search size={12} style={{ color: v2.t3 }} />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder={t("relations.searchPlaceholder")}
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12.5, color: v2.t1 }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {results.map((r: any) => (
              <button key={`${r.type}-${r.id}`} type="button"
                onClick={() => onPick(`meridian://${r.type}/${r.id}`, r.title)}
                style={{ textAlign: "left", padding: "6px 8px", borderRadius: 6, border: "none", background: "transparent", color: v2.t2, cursor: "pointer", fontSize: 12 }}>
                {r.title}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} autoFocus placeholder="https://..."
            style={{ flex: 1, padding: "6px 8px", border: `1px solid ${v2.bd2}`, borderRadius: 7, background: "none", outline: "none", fontSize: 12.5, color: v2.t1 }} />
          <button type="button" onClick={() => externalUrl.trim() && onPick(externalUrl.trim(), externalUrl.trim())}
            style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: ACCENT, color: "#fff", fontSize: 12, cursor: "pointer" }}>
            OK
          </button>
        </div>
      )}
      <button type="button" onClick={onClose} style={{ marginTop: 6, fontSize: 10.5, color: v2.t3, background: "none", border: "none", cursor: "pointer" }}>
        {t("actions.cancel")}
      </button>
    </div>
  )
}

const RESIZE_MIN_WIDTH = 60

function ResizableImageComponent({ node, updateAttributes, selected }: any) {
  const startRef = useRef<{ x: number; width: number } | null>(null)

  const onHandlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const img = e.currentTarget.parentElement?.querySelector("img") as HTMLImageElement | null
    startRef.current = { x: e.clientX, width: node.attrs.width || img?.offsetWidth || 300 }
    const onMove = (ev: PointerEvent) => {
      if (!startRef.current) return
      const delta = ev.clientX - startRef.current.x
      const newWidth = Math.max(RESIZE_MIN_WIDTH, Math.round(startRef.current.width + delta))
      updateAttributes({ width: newWidth })
    }
    const onUp = () => {
      startRef.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <NodeViewWrapper as="span" style={{ display: "inline-block", position: "relative", margin: "8px 0", lineHeight: 0 }}>
      <img src={node.attrs.src} alt={node.attrs.alt || ""}
        style={{ width: node.attrs.width ? `${node.attrs.width}px` : undefined, maxWidth: "100%", borderRadius: 8, display: "block", outline: selected ? `2px solid ${ACCENT}` : "none" }} />
      {selected && (
        <span onPointerDown={onHandlePointerDown}
          style={{
            position: "absolute", right: -5, bottom: -5, width: 12, height: 12,
            borderRadius: 3, background: ACCENT, border: "2px solid #fff",
            cursor: "nwse-resize", touchAction: "none",
          }} />
      )}
    </NodeViewWrapper>
  )
}

const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const w = el.getAttribute("width")
          return w ? Number(w) : null
        },
        renderHTML: (attrs: any) => attrs.width ? { width: attrs.width, style: `width: ${attrs.width}px` } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent)
  },
})

export function RichTextEditor({ value, onChange, entityType, entityId, placeholder, onPendingFileAdded }: {
  value: string; onChange: (html: string) => void; entityType: string; entityId: number | null; placeholder?: string
  onPendingFileAdded?: (blobUrl: string, file: File) => void
}) {
  const t = useT()
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const typeRu = useTypeRu()
  // «@» + запрос: список записей рядом с курсором (@tiptap/suggestion). Расширение создаётся один раз,
  // поэтому состояние списка достаётся через ref, а не через замыкание.
  const [sug, setSug] = useState<MentionUi | null>(null)
  const [sugIndex, setSugIndex] = useState(0)
  const sugRef = useRef<MentionUi | null>(null)
  const idxRef = useRef(0)
  const ui = useRef({
    show: (s: MentionUi) => { sugRef.current = s; if (idxRef.current >= s.items.length) idxRef.current = 0; setSug(s); setSugIndex(idxRef.current) },
    hide: () => { sugRef.current = null; idxRef.current = 0; setSug(null); setSugIndex(0) },
    keydown: (e: KeyboardEvent) => {
      const s = sugRef.current
      const n = s?.items.length ?? 0
      if (!s || n === 0) return false
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        idxRef.current = (idxRef.current + (e.key === "ArrowDown" ? 1 : n - 1)) % n
        setSugIndex(idxRef.current)
        return true
      }
      if (e.key === "Enter") { s.command(s.items[idxRef.current] ?? s.items[0]); return true }
      return false
    },
  }).current

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapLink.configure({ openOnClick: false, protocols: ["http", "https", "meridian"] }),
      ResizableImage,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      createMentionExtension(ui),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      // Ctrl+K открывает окно ссылки. Правило в isLinkShortcut: key для латиницы, code для нелатинских раскладок (на русской key = «л»)
      handleKeyDown: (_view, e) => {
        if (isLinkShortcut(e)) { e.preventDefault(); setShowLinkPicker(true); return true }
        return false
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const insertLink = (href: string, title: string) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) {
      // текстовый узел с меткой ссылки, а не HTML-строка: заголовок записи не должен превращаться в разметку
      editor.chain().focus().insertContent({ type: "text", text: title || href, marks: [{ type: "link", attrs: { href } }] }).run()
    } else {
      editor.chain().focus().setLink({ href }).run()
    }
    setShowLinkPicker(false)
  }

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !editor) return
    if (!entityId) {
      // Черновик ещё не сохранён — локальный blob-превью, реальная загрузка
      // произойдёт после создания записи (см. ResultForm/LabResultsTab,
      // ObservationForm/PredictionForm — везде один и тот же паттерн).
      const blobUrl = URL.createObjectURL(file)
      editor.chain().focus().setImage({ src: blobUrl }).run()
      onPendingFileAdded?.(blobUrl, file)
      return
    }
    const uploaded = await imageApi.upload(entityType, entityId, [file])
    const url = resolveMediaUrl(uploaded?.[0]?.url)
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const buttons = [
    { label: "B", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false, style: { fontWeight: 700 } },
    { label: "I", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false, style: { fontStyle: "italic" } },
    { label: "U", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false, style: { textDecoration: "underline" } },
    { label: "S", action: () => editor?.chain().focus().toggleStrike().run(), active: () => editor?.isActive("strike") ?? false, style: { textDecoration: "line-through" } },
    { label: "H1", action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor?.isActive("heading", { level: 1 }) ?? false, style: { fontSize: 11 } },
    { label: "H2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive("heading", { level: 2 }) ?? false, style: { fontSize: 11 } },
    { label: "• ", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false, style: {} },
    { label: "1.", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false, style: {} },
    { label: "❝", action: () => editor?.chain().focus().toggleBlockquote().run(), active: () => editor?.isActive("blockquote") ?? false, style: {} },
  ]

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: v2.bg, borderRadius: "8px 8px 0 0", border: `1px solid ${v2.bd2}`, borderBottom: "none", flexWrap: "wrap", alignItems: "center" }}>
        {buttons.map((btn, i) => (
          <button key={i} type="button" onClick={btn.action}
            style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: btn.active() ? `${ACCENT}20` : "transparent", color: btn.active() ? ACCENT : v2.t3, cursor: "pointer", fontSize: 12, transition: "all 0.1s", ...btn.style }}>
            {btn.label}
          </button>
        ))}
        <div style={{ position: "relative" }}>
          <button type="button" aria-label={t("editor.insertLink")} title={`${t("editor.insertLink")} (Ctrl+K)`} onClick={() => setShowLinkPicker(s => !s)}
            style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: showLinkPicker ? `${ACCENT}20` : "transparent", color: showLinkPicker ? ACCENT : v2.t3, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Link2 size={13} />
          </button>
          {showLinkPicker && <LinkPickerPopover onPick={insertLink} onClose={() => setShowLinkPicker(false)} />}
        </div>
        <label style={{ padding: "4px 8px", borderRadius: 5, color: v2.t3, cursor: "pointer", display: "flex", alignItems: "center" }}>
          <ImageIcon size={13} />
          <input type="file" accept="image/*" onChange={handleImagePick} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ minHeight: 200, padding: "12px 14px", background: v2.bg, border: `1px solid ${v2.bd2}`, borderRadius: "0 0 8px 8px", color: v2.t1, fontSize: 13.5, lineHeight: 1.8, cursor: "text" }}
        onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
      {sug && sug.items.length > 0 && (
        <div role="listbox" aria-label={t("editor.mentionList")}
          style={{ position: "fixed", left: sug.rect?.left ?? 0, top: (sug.rect?.bottom ?? 0) + 4, width: 320, maxHeight: 240, overflowY: "auto", zIndex: 1000,
            background: v2.surf, border: `1px solid ${v2.bd2}`, borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {sug.items.map((it, i) => (
            <button key={`${it.type}-${it.id}`} type="button" role="option" aria-selected={i === sugIndex}
              onMouseDown={e => { e.preventDefault(); sug.command(it) }}
              style={{ display: "flex", width: "100%", alignItems: "baseline", justifyContent: "space-between", gap: 8, textAlign: "left", padding: "6px 8px", borderRadius: 6, border: "none",
                background: i === sugIndex ? `${ACCENT}20` : "transparent", color: v2.t2, cursor: "pointer", fontSize: 12 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
              <span style={{ fontSize: 10.5, color: v2.t3, flexShrink: 0 }}>{typeRu[it.type] ?? it.type}</span>
            </button>
          ))}
        </div>
      )}
      <style>{`
        .tiptap { outline: none; min-height: 160px; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: ${v2.t3}; pointer-events: none; float: left; height: 0; }
        .tiptap strong { color: ${v2.t1}; }
        .tiptap h1 { font-size: 1.3em; font-weight: 700; margin: 8px 0 4px; }
        .tiptap h2 { font-size: 1.1em; font-weight: 600; margin: 6px 0 4px; }
        .tiptap ul, .tiptap ol { padding-left: 20px; }
        .tiptap blockquote { border-left: 3px solid ${ACCENT}; padding-left: 12px; color: ${v2.t3}; margin: 6px 0; }
        .tiptap img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .tiptap a { color: ${ACCENT}; }
      `}</style>
    </div>
  )
}
