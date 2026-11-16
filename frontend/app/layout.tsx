import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono, PT_Serif } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" })
// Акцентный serif — только для "инструментальных" подписей (гейдж, орбиты, приветствие).
// PT Serif спроектирован ParaType специально под кириллицу — в отличие от Newsreader,
// у которого нет кириллических глифов вообще (текст молча падал на системный fallback).
const ptSerif = PT_Serif({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" })
export const metadata: Metadata = {
  metadataBase: new URL("https://miridin.com"),
  title: "Meridian",
  description: "Чтобы не забыть о причинах уверенности — фиксируйте гипотезы и прогнозы, сверяйтесь с реальностью, когда придёт время.",
  openGraph: {
    title: "Meridian",
    description: "Чтобы не забыть о причинах уверенности — фиксируйте гипотезы и прогнозы, сверяйтесь с реальностью, когда придёт время.",
    url: "https://miridin.com",
    siteName: "Meridian",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meridian",
    description: "Чтобы не забыть о причинах уверенности — фиксируйте гипотезы и прогнозы, сверяйтесь с реальностью, когда придёт время.",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${ptSerif.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Meridian",
              "url": "https://miridin.com",
              "description": "Приложение для принятия более эффективных решений: фиксируйте гипотезы и прогнозы, сверяйтесь с реальностью, когда придёт время.",
              "applicationCategory": "LifestyleApplication",
              "operatingSystem": "Web",
              "inLanguage": "ru",
              "publisher": {
                "@type": "Organization",
                "name": "Meridian",
                "url": "https://miridin.com"
              }
            })
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
