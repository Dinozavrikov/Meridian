"use client"
import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, ZoomIn } from "lucide-react"
import { getYouTubeId, getVimeoId } from "@/lib/embed-utils"

export function isImageUrl(url: string) {
  if (url.startsWith("data:image/")) return true
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(url)
}

export function isUrl(str: string) {
  const s = str.trim()
  return /^https?:\/\/\S+$/.test(s) || s.startsWith("data:image/")
}

interface LightboxProps {
  src: string
  onClose: () => void
  /** Подпись под снимком в духе "точка зафиксирована" — например "Алексей · 19:24" */
  caption?: string
  /** Навигация по галерее из нескольких изображений — опционально, стрелки
   *  показываются только если переданы оба колбэка. Используется ImagesTab. */
  onPrev?: () => void
  onNext?: () => void
}

/**
 * "Фиксация координаты" — фирменный жест открытия снимка. Уголки-скобки
 * (тот же teal, что пульс дуги) защёлкиваются на кадре с лёгким перехлёстом,
 * затем появляется подпись тем же моноширинным начертанием, что и таймстемпы
 * записей в ленте. Смысл: снимок не "открылся", а "определился на карте".
 */
export function Lightbox({ src, onClose, caption, onPrev, onNext }: LightboxProps) {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLocked(true), 30)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && onPrev) onPrev()
      if (e.key === "ArrowRight" && onNext) onNext()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose, onPrev, onNext])

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}><X size={15} /></button>

      {onPrev && (
        <button onClick={e => { e.stopPropagation(); onPrev() }} style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>‹</button>
      )}
      {onNext && (
        <button onClick={e => { e.stopPropagation(); onNext() }} style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>›</button>
      )}

      <div className="lightbox-frame" onClick={e => e.stopPropagation()}>
        <img src={src} alt="" style={{ maxWidth: "90vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 4, display: "block", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }} />
        <span className={`lightbox-corner tl ${locked ? "locked" : ""}`} />
        <span className={`lightbox-corner tr ${locked ? "locked" : ""}`} />
        <span className={`lightbox-corner bl ${locked ? "locked" : ""}`} />
        <span className={`lightbox-corner br ${locked ? "locked" : ""}`} />
        {caption && (
          <div className={`lightbox-caption ${locked ? "visible" : ""}`}>
            <span className="dot" /> {caption}
          </div>
        )}
      </div>
    </div>
  )
}

export function isAttachmentRef(s: string): boolean {
  return isUrl(s) || s.startsWith("/api/uploads/")
}

/** Разбирает контент (сообщение/заметку) на текст и вложенную картинку —
 * картинка передаётся отдельной строкой, как и при отправке. Общая логика
 * для ленты диалога и превью в списке диалогов — один разбор в одном месте. */
export function splitAttachment(content: string): { text: string; imageUrl: string | null; videoUrl: string | null } {
  const lines = content.split("\n")
  let imageUrl: string | null = null
  let videoUrl: string | null = null
  const textLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!imageUrl && isAttachmentRef(trimmed) && isImageUrl(trimmed)) {
      imageUrl = trimmed
    } else if (!videoUrl && (getYouTubeId(trimmed) || getVimeoId(trimmed))) {
      videoUrl = trimmed
    } else if (!videoUrl) {
      // Проверим, вдруг внутри обычной строки текста затесалась ссылка на видео
      const words = trimmed.split(/\s+/)
      const foundVideoWord = words.find(w => isUrl(w) && (getYouTubeId(w) || getVimeoId(w)))
      if (foundVideoWord) {
        videoUrl = foundVideoWord
        const remaining = trimmed.replace(foundVideoWord, "").trim()
        if (remaining) textLines.push(remaining)
      } else {
        textLines.push(line)
      }
    } else {
      textLines.push(line)
    }
  }
  return { text: textLines.join("\n").trim(), imageUrl, videoUrl }
}

export function ImageAttachment({ src, accent, caption }: { src: string; accent: string; caption?: string }) {
  const [lightbox, setLightbox] = useState(false)
  const [hov, setHov] = useState(false)
  return (
    <>
      <div onClick={() => setLightbox(true)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ display: "inline-flex", position: "relative", borderRadius: 6, overflow: "hidden", cursor: "zoom-in", border: `1px solid ${hov ? accent + "50" : "rgba(255,255,255,0.07)"}`, transition: "border-color 0.15s" }}>
        <img src={src} alt="" style={{ height: 72, maxWidth: 160, objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: hov ? "rgba(0,0,0,0.35)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
          {hov && <ZoomIn size={15} color="#fff" />}
        </div>
      </div>
      {lightbox && typeof document !== "undefined" && createPortal(
        <Lightbox src={src} onClose={() => setLightbox(false)} caption={caption} />,
        document.body
      )}
    </>
  )
}
