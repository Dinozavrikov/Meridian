import { ImageResponse } from "next/og"
import { OG_SIZE, SITE_NAME } from "@/lib/page-meta"
import type { OgCard } from "@/lib/og-card"
import { ogFonts } from "@/lib/og-fonts"

/** Отрисовка карточки для соцсетей. Одна на картинку записи и общую картинку сайта. */
export async function renderOgCard(c: OgCard) {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "64px 72px", background: "#0F1218", color: "#F2F4F8", fontFamily: "PT Serif",
        borderLeft: `14px solid ${c.color}`,
      }}>
        <div style={{ display: "flex", fontSize: 32, color: c.color }}>{c.label || " "}</div>
        <div style={{ display: "flex", fontSize: c.fontSize, lineHeight: 1.2 }}>{c.title}</div>
        <div style={{ display: "flex", fontSize: 30, color: "#8892A6" }}>{SITE_NAME}</div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
