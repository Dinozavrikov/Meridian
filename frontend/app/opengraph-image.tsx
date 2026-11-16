import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Meridian"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0b0d14", position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(77,207,166,0.12), transparent 60%)",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 28 }}>
          <svg width="56" height="56" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1L12 6.5L6.5 12L1 6.5L6.5 1Z" stroke="#4A90D9" strokeWidth="1" fill="none" />
            <path d="M6.5 3.5L9.5 6.5L6.5 9.5L3.5 6.5L6.5 3.5Z" fill="#4A90D930" stroke="#4A90D960" strokeWidth="0.6" />
          </svg>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#f2efe9", letterSpacing: "-0.02em" }}>
            MER<span style={{ color: "#4dcfa6" }}>I</span>DIAN
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "rgba(242,239,233,0.65)", maxWidth: 820, textAlign: "center", lineHeight: 1.4 }}>
          Чтобы не забыть о причинах уверенности
        </div>
      </div>
    ),
    { ...size }
  )
}
