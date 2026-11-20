"use client"
import { DEFAULT_SCALES } from "@/lib/scales"
import { v2 } from "@/lib/theme"

const MATURITY_SCALE = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")!

export function AuthVisual() {
  const levels = MATURITY_SCALE.levels
  return (
    <div
      className="hidden lg:flex flex-1 flex-col justify-center relative overflow-hidden"
      style={{
        background: v2.bg,
        backgroundImage: `linear-gradient(${v2.bd} 1px, transparent 1px), linear-gradient(90deg, ${v2.bd} 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
        borderLeft: `1px solid ${v2.bd}`,
      }}
    >
      <div style={{ maxWidth: 460, paddingLeft: 96, paddingRight: 48 }}>
        <div
          className="text-xs mb-8"
          style={{ color: v2.t3, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Как растет уверенность
        </div>
        <div className="flex flex-col gap-5">
          {levels.map((level, i) => {
            const t = i / (levels.length - 1)
            const dot = 7 + i * 5
            return (
              <div key={level.value} className="flex items-center gap-5">
                <div
                  style={{
                    width: dot, height: dot, borderRadius: "50%",
                    background: MATURITY_SCALE.color,
                    opacity: 0.18 + t * 0.82,
                    flexShrink: 0,
                    boxShadow: i === levels.length - 1 ? `0 0 18px ${MATURITY_SCALE.color}80` : "none",
                  }}
                />
                <div
                  className="text-[15px]"
                  style={{
                    color: v2.t1, opacity: 0.35 + t * 0.65,
                    fontWeight: i === levels.length - 1 ? 600 : 400,
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {level.label}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs mt-10 leading-relaxed" style={{ color: v2.t3, maxWidth: 340 }}>
          Каждая гипотеза в Meridian проходит этот путь — от первого впечатления
          до вывода, на который можно опереться.
        </p>
      </div>
    </div>
  )
}
