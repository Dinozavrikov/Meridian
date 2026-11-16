"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, KeyRound, Eye, Bell, ShieldCheck, Download, AlertTriangle } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"

export function SettingsNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const t = useT()

  const NAV = [
    { group: t("settingsNav.group.personal"), items: [
      { href: "/settings/profile", label: t("settings.profile.title"), icon: User, color: v2.violet },
      { href: "/settings/account", label: t("settings.account.title"), icon: KeyRound, color: "#4A90D9" },
    ]},
    { group: t("settingsNav.group.system"), items: [
      { href: "/settings/privacy", label: t("settings.privacy.title"), icon: Eye, color: v2.teal },
      { href: "/settings/notifications", label: t("settings.notifications.title"), icon: Bell, color: v2.amber },
      { href: "/settings/security", label: t("settings.security.title"), icon: ShieldCheck, color: "#4A90D9" },
    ]},
    { group: t("settingsNav.group.data"), items: [
      { href: "/settings/export", label: t("settingsNav.export"), icon: Download, color: v2.teal },
    ]},
  ]

  const DANGER = { href: "/settings/danger", label: t("settings.danger.title"), icon: AlertTriangle }

  if (mobile) {
    const all = [...NAV.flatMap(g => g.items), { ...DANGER, color: v2.red }]
    return (
      <nav style={{
        display: "flex", gap: 6, overflowX: "auto", padding: "10px 12px",
        borderBottom: `0.5px solid ${v2.bd}`, flexShrink: 0,
      }}>
        {all.map(item => {
          const active = pathname === item.href
          const isDanger = item.href === DANGER.href
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none", flexShrink: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: 20, whiteSpace: "nowrap",
                background: active ? (isDanger ? "rgba(224,91,91,0.12)" : v2.surf2) : "transparent",
                border: `0.5px solid ${active ? v2.bd2 : "transparent"}`,
              }}>
                <item.icon size={12} style={{ color: isDanger ? v2.red : item.color }} />
                <span style={{ fontSize: 12, color: isDanger ? v2.red : (active ? v2.t1 : v2.t2) }}>{item.label}</span>
              </div>
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav style={{ width: 240, flexShrink: 0, borderRight: `0.5px solid ${v2.bd}`, padding: "20px 12px", overflowY: "auto" }}>
      {NAV.map(g => (
        <div key={g.group} style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            color: v2.t3, padding: "10px 14px 6px",
          }}>{g.group}</div>
          {g.items.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "10px 14px", borderRadius: 9, cursor: "pointer", marginBottom: 2,
                  background: active ? v2.surf2 : "transparent",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    background: `${item.color}26`, color: item.color, flexShrink: 0,
                  }}>
                    <item.icon size={13} />
                  </div>
                  <span style={{ fontSize: 13, color: active ? v2.t1 : v2.t2, fontWeight: active ? 600 : 400 }}>
                    {item.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      ))}
      <div style={{ height: 1, background: v2.bd, margin: "14px 8px" }} />
      <Link href={DANGER.href} style={{ textDecoration: "none" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 11,
          padding: "10px 14px", borderRadius: 9, cursor: "pointer",
          background: pathname === DANGER.href ? "rgba(224,91,91,0.08)" : "transparent",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(224,91,91,0.12)", color: v2.red, flexShrink: 0,
          }}>
            <DANGER.icon size={13} />
          </div>
          <span style={{ fontSize: 13, color: v2.red, opacity: 0.8 }}>{DANGER.label}</span>
        </div>
      </Link>
    </nav>
  )
}
