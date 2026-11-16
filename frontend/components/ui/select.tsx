"use client"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs text-[#909090] font-medium">{label}</label>}
      <select
        ref={ref}
        className={cn(
          "bg-[#1c1c1c] border border-[#2c2c2c] rounded-lg px-3 py-2 text-sm text-[#e0e0e0]",
          "focus:border-[#4A90D9] focus:outline-none transition-colors appearance-none cursor-pointer",
          error && "border-[#E74C3C]",
          className
        )}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#1c1c1c]">
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-[#E74C3C]">{error}</span>}
    </div>
  )
)
Select.displayName = "Select"
