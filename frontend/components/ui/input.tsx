"use client"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"
import { v2 } from "@/lib/theme"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs text-[#909090] font-medium">{label}</label>}
      <input
        ref={ref}
        className={cn(
          "bg-[#1c1c1c] border border-[#2c2c2c] rounded-lg px-3 py-2 text-sm text-[#e8e8e8]",
          "placeholder:text-[#505050] focus:border-[#4A90D9] focus:outline-none transition-colors",
          error && "border-[#E74C3C]",
          className
        )}
        style={{ outline: "none", boxShadow: "none" }}
        {...props}
      />
      {error && (
        <span style={{
          display: "block", borderLeft: `2px solid ${v2.red}`, paddingLeft: 8,
          color: v2.red, fontSize: 11, letterSpacing: "0.02em", lineHeight: 1.4,
        }}>{error}</span>
      )}
    </div>
  )
)
Input.displayName = "Input"

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs text-[#909090] font-medium">{label}</label>}
      <textarea
        ref={ref}
        className={cn(
          "bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#dcdcdc]",
          "placeholder:text-[#505050] focus:border-[#4A90D9] focus:outline-none transition-colors resize-none",
          error && "border-[#E74C3C]",
          className
        )}
        {...props}
      />
      {error && (
        <span style={{
          display: "block", borderLeft: `2px solid ${v2.red}`, paddingLeft: 8,
          color: v2.red, fontSize: 11, letterSpacing: "0.02em", lineHeight: 1.4,
        }}>{error}</span>
      )}
    </div>
  )
)
Textarea.displayName = "Textarea"
