"use client"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { Button } from "./button"

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  /** Отключает закрытие по Escape и клику на фон — для шагов, которые
   *  пользователь должен осознанно прочитать и закрыть сам (например,
   *  результат ИИ-сравнения), а не случайно смахнуть. */
  preventClose?: boolean
  /** небольшое окно: отступы 20px вместо 32px */
  compact?: boolean
  /** Слой окна. По умолчанию z-50; диалоги, которые должны лечь поверх других окон (например, выбор «кому видно»), задают больше */
  zIndex?: number
}

export function Modal({ open, onClose, title, children, className, size = "md", preventClose = false, compact = false, zIndex }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !preventClose) onClose() }
    if (open) document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose, preventClose])

  if (!open || typeof document === "undefined") return null

  // Портал в body: окно, открытое из липкой колонки (паспорт), иначе остаётся в её слое наложения
  // и кнопки соседних колонок оказываются поверх него.
  return createPortal(
    <>
    <style>{`@keyframes _mo{from{opacity:0}to{opacity:1}}@keyframes _mp{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", animation: "_mo 0.18s ease", ...(zIndex ? { zIndex } : {}) }}
      onClick={e => { if (e.target === overlayRef.current && !preventClose) onClose() }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cn(
          "bg-[#1a1a1a] border border-[#242424] rounded-xl shadow-2xl flex flex-col max-h-[90vh]",
          {
            "w-full max-w-sm":  size === "sm",
            "w-full max-w-lg":  size === "md",
            "w-full max-w-2xl": size === "lg",
            "w-full max-w-4xl": size === "xl",
          },
          className
        )}
        style={{ animation: "_mp 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        {title && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: compact ? "14px 20px" : "20px 32px", borderBottom: "1px solid #242424" }}>
            <h2 className="text-base font-semibold text-[#e0e0e0]">{title}</h2>
            {!preventClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="p-1.5">
                <X size={16} />
              </Button>
            )}
          </div>
        )}
        <div style={{ overflowY: "auto", flex: 1, padding: compact ? "20px" : "32px" }}>{children}</div>
      </div>
    </div>
    </>,
    document.body,
  )
}
