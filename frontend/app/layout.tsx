import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono, PT_Serif } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/page-meta"
import { SITE_JSON_LD } from "@/lib/site-jsonld"
import { safeJsonLd } from "@/lib/json-ld"
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" })
// Акцентный serif — только для "инструментальных" подписей (гейдж, орбиты, приветствие).
// PT Serif спроектирован ParaType специально под кириллицу — в отличие от Newsreader,
// у которого нет кириллических глифов вообще (текст молча падал на системный fallback).
const ptSerif = PT_Serif({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" })
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${ptSerif.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(SITE_JSON_LD) }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
