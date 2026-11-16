"use client"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"

interface SettingsSectionProps {
  icon: React.ReactNode
  color: string
  title: string
  subtitle?: string
  children: React.ReactNode
}

const MERIDIAN_BACK_CSS = `
@keyframes mb-dot { from { offset-distance: 0%; } to { offset-distance: 100%; } }
.mb-link .mb-arc-glow { opacity: 0.35; transition: opacity 0.3s; }
.mb-link:hover .mb-arc-glow { opacity: 0.9; }
.mb-link .mb-dot { opacity: 0; offset-path: path('M 2 2 Q 11 16 2 30'); offset-distance: 0%; }
.mb-link:hover .mb-dot { opacity: 1; animation: mb-dot 0.5s ease-out forwards; }
.mb-link .mb-label { opacity: 0.55; transform: translateX(-2px); transition: opacity 0.3s ease 0.05s, transform 0.3s ease 0.05s; }
.mb-link:hover .mb-label { opacity: 1; transform: translateX(0); }
`

function MeridianBackIcon() {
  return (
    <svg width="13" height="32" viewBox="0 0 13 32" fill="none" style={{ overflow: "visible", flexShrink: 0 }}>
      <path className="mb-arc-glow" d="M 2 2 Q 11 16 2 30" stroke={`url(#mb-grad)`} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle className="mb-dot" r="2.5" fill={v2.teal} style={{ filter: `drop-shadow(0 0 4px ${v2.teal})` }} />
      <defs>
        <linearGradient id="mb-grad" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={v2.violet} />
          <stop offset="1" stopColor={v2.teal} />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function SettingsSection({ icon, color, title, subtitle, children }: SettingsSectionProps) {
  const { user } = useStore()
  const t = useT()

  return (
    <div style={{ maxWidth: 660, display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{MERIDIAN_BACK_CSS}</style>
      {user && (
        <Link href={`/profile/${user.username}`} className="mb-link" style={{ textDecoration: "none", width: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, height: 32 }}>
            <MeridianBackIcon />
            <span className="mb-label" style={{ fontSize: 12, color: v2.t2 }}>{t("settings.backToProfile")}</span>
          </div>
        </Link>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: `${color}26`, color, flexShrink: 0,
          }}>{icon}</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: v2.t1 }}>
            {title}
          </h1>
        </div>
        {subtitle && (
          <p style={{ fontSize: 12.5, color: v2.t3, margin: "0 0 0 46px" }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}
