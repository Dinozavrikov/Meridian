"use client"
import React from "react"
import { statusColor } from "@/lib/theme"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { Pill } from "@/components/ui/pill"

interface StatusBadgeProps {
  status: string
  /** от 12px — крупный бейдж (карточка записи), меньше — компактный (списки) */
  fontSize?: number
}

/**
 * Единый бейдж статуса с цветной точкой-маркером.
 * Используется во всех списках и детальных панелях сущностей.
 *
 * Статус переводится через useDynamicTranslate — без фиксированного списка
 * значений (сам текст статуса и есть ключ кэша), поэтому набор статусов
 * может свободно меняться независимо от i18n-кода.
 */
export function StatusBadge({ status, fontSize = 10 }: StatusBadgeProps) {
  const c = (statusColor as Record<string, string>)[status] ?? "#484848"
  const dt = useDynamicTranslate([status], { noYo: true })
  return <Pill color={c} dot size={fontSize >= 12 ? "md" : "sm"}>{dt(status)}</Pill>
}
