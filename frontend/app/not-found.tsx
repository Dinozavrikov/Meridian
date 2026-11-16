"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { v2 } from "@/lib/theme"
import { ArrowLeft, Lightbulb, Compass } from "lucide-react"
import { DriftNetwork } from "@/components/ui/drift-network"

export default function NotFound() {
  const pathname = usePathname()
  const [conf, setConf] = useState(50)

  // Уверенность в существовании страницы стремительно падает до нуля —
  // как индикатор проверки гипотезы, которая только что провалилась.
  useEffect(() => {
    const t = setTimeout(() => setConf(2), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      position: "relative", minHeight: "100vh", overflow: "hidden",
      background: `radial-gradient(ellipse 900px 500px at 50% -10%, rgba(77,207,166,0.08), transparent 60%), ${v2.bg}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: v2.fontSans,
    }}>
      <DriftNetwork />

      <div style={{
        position: "relative", width: "100%", maxWidth: 460,
        background: v2.surf, border: `1px solid ${v2.bd}`, borderRadius: 16,
        overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
      }}>
        {/* акцентная полоска, как у настоящих карточек сущностей */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#e05b5b" }} />

        <div style={{ padding: "22px 26px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Lightbulb size={12} style={{ color: v2.violet }} />
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: v2.violet }}>
              Гипотеза
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 5,
              background: "#e05b5b18", color: "#e05b5b", border: "1px solid #e05b5b30",
            }}>
              ● не подтвердилась
            </span>
          </div>

          <div style={{ fontSize: 11, color: v2.t3, marginBottom: 4 }}>Предполагалось, что существует:</div>
          <div style={{
            fontFamily: v2.fontMono, fontSize: 14, color: v2.t1, wordBreak: "break-all",
            background: "rgba(255,255,255,0.03)", border: `1px solid ${v2.bd}`, borderRadius: 8,
            padding: "9px 12px", marginBottom: 20,
          }}>
            {pathname}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, color: v2.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Уверенность</span>
            <span style={{ fontFamily: v2.fontMono, fontSize: 12, fontWeight: 700, color: "#e05b5b" }}>{conf}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${conf}%`, borderRadius: 4,
              background: "linear-gradient(90deg, #e05b5b, #c94444)",
              transition: "width 1.1s cubic-bezier(0.4, 0, 0.2, 1)",
            }} />
          </div>

          <p style={{ fontSize: 12.5, color: v2.t3, lineHeight: 1.6, margin: "18px 0 0" }}>
            Данные не подтверждают существование этой страницы. Возможно, она была удалена,
            переименована — или гипотеза изначально была неверной.
          </p>
        </div>

        <div style={{ display: "flex", borderTop: `1px solid ${v2.bd}` }}>
          <Link href="/dashboard" style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "13px 0", fontSize: 12.5, fontWeight: 600, color: "#062018",
            background: "linear-gradient(135deg, #4dcfa6, #3fb894)", textDecoration: "none",
          }}>
            <ArrowLeft size={13} /> На дашборд
          </Link>
          <Link href="/hypotheses" style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "13px 0", fontSize: 12.5, fontWeight: 600, color: v2.t2,
            borderLeft: `1px solid ${v2.bd}`, textDecoration: "none",
          }}>
            <Compass size={13} /> К гипотезам
          </Link>
        </div>
      </div>
    </div>
  )
}
