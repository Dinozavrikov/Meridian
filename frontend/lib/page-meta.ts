import type { Metadata } from "next"
import { STRINGS } from "@/lib/i18n/strings"

/** Имя сайта: суффикс заголовков, og:site_name. Единственное место, где оно записано. */
export const SITE_NAME = "Meridian"

/** Размер картинки для соцсетей. Единственное место: картинки записей и сайта берут его отсюда. */
export const OG_SIZE = { width: 1200, height: 630 } as const

/** Общая картинка сайта для страниц, у которых нет картинки своей записи. Рисуется на /og. */
export const SITE_IMAGE = { url: "/og.png", ...OG_SIZE, alt: SITE_NAME } as const

const str = (key: string) => (STRINGS as Record<string, string>)[key] ?? ""

/** OpenGraph и Twitter страницы раздела: тип, картинка с размерами, адрес. Нужны оба набора целиком:
 *  объект openGraph дочернего layout заменяет родительский, и недостающие теги пропадают. */
export function shareMetadata(path: string, title: string, description: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { type: "website", title, description, url: path, siteName: SITE_NAME, images: [SITE_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SITE_IMAGE.url] },
  }
}

/** Метаданные публичной страницы из strings.ts: у каждой свой title, description и canonical. */
export function pageMetadata(path: string, titleKey: string, descriptionKey: string): Metadata {
  const title = `${str(titleKey)} · ${SITE_NAME}`
  const description = str(descriptionKey)
  return { title, description, alternates: { canonical: path }, ...shareMetadata(path, title, description) }
}
