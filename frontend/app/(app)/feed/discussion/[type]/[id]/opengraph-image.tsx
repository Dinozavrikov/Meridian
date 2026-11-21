import { ImageResponse } from "next/og"
import { fetchEntityCore } from "@/lib/feed-server"
import { ogCard, OG_SIZE } from "@/lib/og-card"
import { ogFonts } from "@/lib/og-fonts"
import { SITE_NAME } from "@/lib/page-meta"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = SITE_NAME

export default async function Image({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const [core, fonts] = await Promise.all([fetchEntityCore(type, id), ogFonts()])
  const c = ogCard(core, type)
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
    { ...OG_SIZE, fonts },
  )
}
