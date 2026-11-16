"use client"
import { cn } from "@/lib/utils"

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
}

export function Card({ children, className, onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(className)}
      style={{
        background: "#151515",
        border: "1px solid #222",
        borderRadius: 12,
        padding: 20,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => {
        if (!hover && !onClick) return
        ;(e.currentTarget as HTMLElement).style.borderColor = "#2e2e2e"
        ;(e.currentTarget as HTMLElement).style.background = "#181818"
      }}
      onMouseLeave={e => {
        if (!hover && !onClick) return
        ;(e.currentTarget as HTMLElement).style.borderColor = "#222"
        ;(e.currentTarget as HTMLElement).style.background = "#151515"
      }}
    >
      {children}
    </div>
  )
}
