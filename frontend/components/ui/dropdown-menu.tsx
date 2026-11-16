"use client"
// frontend/components/ui/dropdown-menu.tsx
//
// Тонкая обёртка над @radix-ui/react-dropdown-menu в стиле проекта.
// Используется для кнопок "Добавить" с плоским списком опций (таб-кнопка:
// Создать/Привязать; глобальная кнопка: список типов сущностей).
// Сознательно НЕ используем DropdownMenuSub (вложенные меню) — плохо
// работают на тач-устройствах, договорились избегать (см. обсуждение).
import * as RadixDropdown from "@radix-ui/react-dropdown-menu"
import type { ReactNode } from "react"
import { ink } from "@/lib/theme"

export const DropdownMenu = RadixDropdown.Root
export const DropdownMenuTrigger = RadixDropdown.Trigger

export function DropdownMenuContent({ children, align = "end", minWidth = 240 }: { children: ReactNode; align?: "start" | "end" | "center"; minWidth?: number }) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        style={{
          minWidth, maxWidth: "calc(100vw - 24px)", background: ink.card, border: "1px solid #323855",
          borderRadius: 12, padding: 6, boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
          zIndex: 100, animation: "_ddIn 0.12s ease",
        }}
      >
        <style>{`@keyframes _ddIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}.mdd-item[data-highlighted]{background:#1e2236}`}</style>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  )
}

export function DropdownMenuItem({ children, onSelect, icon }: { children: ReactNode; onSelect: () => void; icon?: ReactNode }) {
  return (
    <RadixDropdown.Item
      className="mdd-item"
      onSelect={e => { e.preventDefault(); onSelect() }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        minHeight: 40, padding: "8px 10px", borderRadius: 8, fontSize: 14,
        color: "#d6d9ec", cursor: "pointer", outline: "none",
      }}
    >
      {icon}{children}
    </RadixDropdown.Item>
  )
}

export function DropdownMenuSeparator() {
  return <RadixDropdown.Separator style={{ height: 1, background: "#262b42", margin: "5px 0" }} />
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "6px 10px", fontSize: 11, color: ink.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </div>
  )
}
