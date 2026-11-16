"use client"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost" | "danger" | "outline"
  size?: "sm" | "md" | "lg"
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none",
        variant === "default" && "bg-[#1e1e1e] border border-[#2a2a2a] text-[#d0d0d0] hover:bg-[#252525] hover:border-[#363636] hover:text-white",
        variant === "primary" && "bg-[#4A90D9] text-white hover:bg-[#3a80c9] shadow-[0_0_20px_#4A90D920]",
        variant === "ghost"   && "bg-transparent text-[#888] hover:bg-[#1a1a1a] hover:text-[#e0e0e0]",
        variant === "outline" && "bg-transparent border border-[#2a2a2a] text-[#c0c0c0] hover:border-[#4A90D9] hover:text-white",
        variant === "danger"  && "bg-[#E74C3C15] border border-[#E74C3C33] text-[#E74C3C] hover:bg-[#E74C3C25]",
        size === "sm" && "text-xs px-3 py-1.5 h-7",
        size === "md" && "text-sm px-4 py-2 h-9",
        size === "lg" && "text-sm px-6 py-3 h-11",
        className
      )}
      {...props}
    />
  )
)
Button.displayName = "Button"
