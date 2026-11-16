"use client"
import type { ComponentProps } from "react"
import { LegalCards } from "@/components/legal/legal-cards"
import { usePrivacyText } from "./privacy-context"

/** Карточки приватности: тот же ряд, что и на странице условий, а плейсхолдеры заполняются сроками с сервера. */
export function PrivacyCards(props: Omit<ComponentProps<typeof LegalCards>, "text">) {
  const d = usePrivacyText()
  return <LegalCards {...props} text={d} />
}
