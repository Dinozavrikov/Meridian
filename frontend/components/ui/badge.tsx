"use client"
import { cn } from "@/lib/utils"
import { STATUS_COLORS, TYPE_COLORS } from "@/lib/utils"

interface BadgeProps {
  children: React.ReactNode
  status?: string
  type?: string
  className?: string
}

export function Badge({ children, status, type, className }: BadgeProps) {
  const color = status
    ? STATUS_COLORS[status] ?? "#555"
    : type
    ? TYPE_COLORS[type] ?? "#555"
    : "#555"

  return (
    <span
      className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", className)}
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  )
}
