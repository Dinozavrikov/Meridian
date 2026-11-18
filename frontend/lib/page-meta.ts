import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"

const str = (key: string) => (STRINGS as Record<string, string>)[key] ?? ""

/** Метаданные публичной страницы из strings.ts: у каждой свой title, description и canonical. */
export function pageMetadata(path: string, titleKey: string, descriptionKey: string): Metadata {
  const title = `${str(titleKey)} · Meridian`
  const description = str(descriptionKey)
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: path } }
}
