"use client"
import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { useStore } from "@/lib/store"
import { useRequireAuth } from "@/lib/use-require-auth"
import { api, profileApi } from "@/lib/api"
import { useMyLabs } from "@/lib/use-my-labs"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"
import { Avatar } from "@/components/ui/avatar"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import Link from "next/link"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { v2 } from "@/lib/theme"
import {
  User, CalendarDays, Lightbulb, Eye,
  TrendingUp, Globe, HelpCircle, Settings, Mail, CheckCircle2,
} from "lucide-react"
import { OrbitSelector, VisibilityValue } from "@/components/ui/orbit-selector"
import { useT } from "@/lib/i18n/useT"
import { ruPluralForm } from "@/lib/i18n/ru-plural"
import { useTranslatedField, useListContentTranslation } from "@/lib/i18n/useContentT"
import { CalibrationChart, CalibrationSummary } from "@/components/shared/calibration-chart"

function relativeTime(t: (key: string, vars?: Record<string, string | number>) => string, iso: string): string {
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86400000)
  if (days <= 0) return t("profilePage.today")
  if (days === 1) return t("profilePage.yesterday")
  if (days < 7) return t("profilePage.daysAgo", { n: days })
  if (days < 30) return t("profilePage.weeksAgo", { n: Math.floor(days / 7) })
  return t("profilePage.monthsAgo", { n: Math.floor(days / 30) })
}

const SECTION_QUOTE_KEY: Record<string, string> = {
  hypotheses: "profilePage.hypothesesQuote",
  observations: "profilePage.observationsQuote",
  predictions: "profilePage.predictionsQuote",
  worldview: "profilePage.worldviewQuote",
  questions: "profilePage.questionsQuote",
}

const ENTITY_ITEMS = [
  { key: "hypotheses",   labelKey: "profilePage.hypothesesLabel",   icon: Lightbulb,  color: "#4A90D9", href: "/hypotheses" },
  { key: "observations", labelKey: "profilePage.observationsLabel", icon: Eye,        color: "#2ECC71", href: "/observations" },
  { key: "predictions",  labelKey: "profilePage.predictionsLabel",  icon: TrendingUp, color: "#F5A623", href: "/predictions" },
  { key: "worldview",    labelKey: "profilePage.worldviewLabel",    icon: Globe,      color: "#8b80f0", href: "/worldview" },
  { key: "questions",    labelKey: "profilePage.questionsLabel",    icon: HelpCircle, color: "#1ABC9C", href: "/questions" },
] as const

function formatDate(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
}

// ── Радар с произвольным числом осей ────────────────────────────────────
function RadarChart({ data, t }: { data: { key: string; label: string; value_pct: number }[]; t: (key: string) => string }) {
  if (!data || data.length < 3) {
    return (
      <div style={{ fontSize: 11, color: v2.t3, fontStyle: "italic", padding: "30px 0", textAlign: "center" }}>
        {t("profilePage.radarInsufficientData")}
      </div>
    )
  }
  const n = data.length
  const cx = 170, cy = 155, maxR = 95, labelR = 118
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, r: number) => {
    const a = angleFor(i)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const rings = [0.2, 0.4, 0.6, 0.8, 1]
  const dataPoints = data.map((d, i) => pt(i, (Math.max(0, Math.min(100, d.value_pct)) / 100) * maxR))
  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(" ")

  return (
    <svg width="100%" height="290" viewBox="0 0 340 300">
      {rings.map(r => {
        const ringPts = data.map((_, i) => pt(i, r * maxR))
        return (
          <polygon key={r} points={ringPts.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        )
      })}
      {data.map((_, i) => {
        const outer = pt(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.06)" />
      })}
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4dcfa6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b80f0" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <polygon points={dataPath} fill="url(#radarFill)" stroke="#4dcfa6" strokeWidth={1.8} strokeLinejoin="round" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#4dcfa6" />)}
      {data.map((d, i) => {
        const lp = pt(i, labelR)
        const anchor = Math.abs(Math.cos(angleFor(i))) < 0.3 ? "middle" : Math.cos(angleFor(i)) > 0 ? "start" : "end"
        return (
          <g key={d.key}>
            <text x={lp.x} y={lp.y - 4} textAnchor={anchor} fontSize={9.5} fill={v2.t3}>{d.label}</text>
            <text x={lp.x} y={lp.y + 8} textAnchor={anchor} fontSize={9.5} fontWeight={700} fill={v2.teal}>{d.value_pct}%</text>
          </g>
        )
      })}
    </svg>
  )
}

function ActivityHeatmap({ activity, t }: { activity: { date: string; count: number }[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const cells = useMemo(() => {
    const map = new Map((activity ?? []).map(a => [a.date, a.count]))
    const days: { date: string; count: number }[] = []
    const today = new Date()
    for (let i = 149; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ date: key, count: map.get(key) ?? 0 })
    }
    return days
  }, [activity])

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: 3, marginTop: 14 }}>
        {cells.map(c => (
          <div key={c.date} title={t("profilePage.heatmapTooltip", { date: c.date, count: c.count })} style={{
            width: "100%", aspectRatio: "1", borderRadius: 2,
            background: c.count === 0 ? "rgba(255,255,255,0.04)" : `rgba(77,207,166,${Math.min(0.25 + c.count * 0.13, 1)})`,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, fontSize: 10, color: v2.t3 }}>
        <span style={{ marginRight: 2 }}>{t("profilePage.heatmapLess")}</span>
        {[0, 0.25, 0.5, 0.75, 1].map(o => (
          <div key={o} style={{ width: 11, height: 11, borderRadius: 2, background: o === 0 ? "rgba(255,255,255,0.04)" : `rgba(77,207,166,${o})` }} />
        ))}
        <span style={{ marginLeft: 2 }}>{t("profilePage.heatmapMore")}</span>
      </div>
    </>
  )
}

export default function ProfilePage() {
  const t = useT()
  const { username: rawUsername } = useParams<{ username: string }>()
  const username = decodeURIComponent(rawUsername)
  const currentUser = useStore(s => s.user)
  const { isGuest, requireAuth } = useRequireAuth()
  const isMe = currentUser?.username === username
  const isMobile = useIsMobile()
  const [scopeVisibility, setScopeVisibility] = useState<VisibilityValue[]>([])
  const [scopeLabId, setScopeLabId] = useState<number | null>(null)
  const { data: labs = [] } = useMyLabs(isMe)

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.get(`/api/v1/users/${username}`).then(r => r.data),
    enabled: !!username,
  })

  const { data: stats } = useQuery({
    queryKey: ["profile-stats", username, scopeVisibility, scopeLabId],
    queryFn: () => profileApi.stats(username, scopeVisibility, scopeLabId),
    enabled: !!username,
  })
  const { data: thinkingPatterns = [] } = useQuery({
    queryKey: ["thinking-patterns"],
    queryFn: () => profileApi.thinkingPatterns(),
    enabled: isMe,  // эндпоинт всегда про текущего зрителя, не про владельца профиля
  })

  // Перевод чужого контента: bio + RECENT-записи. entity_type/field подобраны
  // так, чтобы совпадать с кэш-ключами, которые уже используют страницы
  // /hypotheses, /worldview и т.д. (см. useContentT.ts) — иначе один и тот же
  // объект переводился бы дважды под разными ключами кэша.
  const translatedBio = useTranslatedField("user", profile?.id ?? 0, "bio", profile?.bio ?? "", isMe)
  const recentData = stats?.recent as Record<string, { id: number; slug: string; title: string; created_at: string; href: string }[]> | undefined
  const trHyp = useListContentTranslation("hypothesis", recentData?.hypotheses ?? [], ["name"], () => isMe)
  const trObs = useListContentTranslation("observation", recentData?.observations ?? [], ["title"], () => isMe)
  const trPred = useListContentTranslation("prediction", recentData?.predictions ?? [], ["title"], () => isMe)
  const trWv = useListContentTranslation("worldview", recentData?.worldview ?? [], ["belief"], () => isMe)
  const trQ = useListContentTranslation("question", recentData?.questions ?? [], ["title"], () => isMe)
  const recentTrFns: Record<string, (item: any, field: string, fallback: string) => string> = {
    hypotheses: trHyp, observations: trObs, predictions: trPred, worldview: trWv, questions: trQ,
  }
  const recentTrField: Record<string, string> = {
    hypotheses: "name", observations: "title", predictions: "title", worldview: "belief", questions: "title",
  }

  if (isLoading) return (
    <PageShell>
      <Header titleKey="page.profile.title" icon={<User size={15} />} color="#8b80f0" />
      <PageContent><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh", color: v2.t3, fontSize: 13 }}>{t("profilePage.loading")}</div></PageContent>
    </PageShell>
  )
  if (isError || !profile) return (
    <PageShell>
      <Header titleKey="page.profile.title" icon={<User size={15} />} color="#8b80f0" />
      <PageContent><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh", color: "#E74C3C", fontSize: 13 }}>{t("profilePage.userNotFound")}</div></PageContent>
    </PageShell>
  )

  const memberSince = formatDate(profile.created_at)
  const fp = stats?.fingerprint
  const fpTotal = fp ? fp.confirmed + fp.pending + fp.rejected : 0

  return (
    <PageShell>
      <Header
        title={profile.display_name || profile.username}
        icon={<User size={15} />}
        color="#8b80f0"
        actions={isMe && !isMobile ? (
          <a href="/settings" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: v2.t2, textDecoration: "none", padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)" }}>
            <Settings size={12} /> {t("profilePage.settingsLink")}
          </a>
        ) : undefined}
      />
      <PageContent noPadding>
        <div style={{ maxWidth: 1600, width: "100%", minWidth: 0, margin: "0 auto", padding: isMobile ? "16px 14px 60px" : "40px 40px 90px" }}>

          {/* HERO */}
          <div style={{ position: "relative", borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 24, background: "linear-gradient(150deg, #0f1220 0%, #0b0d16 55%, #0c1018 100%)" }}>
            <div style={{ position: "absolute", top: -140, left: "50%", transform: "translateX(-50%)", width: 480, height: 340, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(77,207,166,0.16) 0%, rgba(139,128,240,0.08) 45%, transparent 75%)", filter: "blur(10px)", pointerEvents: "none" }} />
            <div style={{ position: "relative", padding: isMobile ? "22px 16px 18px" : "40px 36px 32px" }}>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20 }}>
                  {isMe ? (
                    <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
                      <ProfileAvatar size={79} showLabel={false} />
                      <Link href="/settings/profile" style={{ textDecoration: "none" }}>
                        <div style={{
                          position: "absolute", right: -4, bottom: -4,
                          width: 24, height: 24, borderRadius: 8,
                          background: v2.surf, border: `1.5px solid ${v2.bg}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: v2.t2, cursor: "pointer", transition: "color 0.12s, background 0.12s",
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = v2.t1; (e.currentTarget as HTMLElement).style.background = v2.surf2 }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = v2.t2; (e.currentTarget as HTMLElement).style.background = v2.surf }}
                        >
                          <Settings size={12} />
                        </div>
                      </Link>
                    </div>
                  ) : (
                    <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
                      <div style={{
                        position: "absolute", inset: -10, borderRadius: 26,
                        background: "conic-gradient(from 0deg, #4dcfa6, #8b80f0, #4dcfa6)",
                        opacity: 0.5, filter: "blur(14px)",
                      }} />
                      <div style={{ position: "relative", width: 84, height: 84, borderRadius: 20, padding: 2.5, background: "linear-gradient(135deg, #4dcfa6, #8b80f0)" }}>
                        <div style={{ borderRadius: 17.5, width: "100%", height: "100%", overflow: "hidden" }}>
                          <Avatar name={profile.display_name || profile.username} size={79} avatarUrl={profile.avatar_url} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ paddingTop: 4, minWidth: 0, flex: 1 }}>
                    <h1 style={{ fontSize: isMobile ? 19 : 27, fontWeight: 800, margin: "0 0 3px", letterSpacing: "-0.03em", color: v2.t1, overflowWrap: "break-word" }}>
                      {profile.display_name || profile.username}
                    </h1>
                    {memberSince && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: v2.t3 }}>
                        <CalendarDays size={11} /> {t("profilePage.memberSince", { date: memberSince })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end", gap: 16, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {isMe ? (
                      <a href="/settings" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: v2.t2, textDecoration: "none", padding: "8px 15px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                        <Settings size={12} /> {t("profilePage.settingsLink")}
                      </a>
                    ) : isGuest ? (
                      // Кнопка остаётся на месте (не скрываем совсем — это
                      // хороший момент конверсии "хочу написать -> надо
                      // зарегистрироваться"), но ведёт на AuthGateModal,
                      // а не в реальный чат.
                      <button onClick={() => requireAuth(() => {})} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#062018", textDecoration: "none", padding: "8px 15px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #4dcfa6, #3fb894)", boxShadow: "0 4px 16px rgba(77,207,166,0.25)", cursor: "pointer" }}>
                        <Mail size={12} /> {t("profilePage.writeMessage")}
                      </button>
                    ) : (
                      <a href={`/messages/${profile.username}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#062018", textDecoration: "none", padding: "8px 15px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #4dcfa6, #3fb894)", boxShadow: "0 4px 16px rgba(77,207,166,0.25)" }}>
                        <Mail size={12} /> {t("profilePage.writeMessage")}
                      </a>
                    )}
                  </div>
                  <OrbitSelector
                    active={scopeVisibility}
                    onChange={setScopeVisibility}
                    labs={labs}
                    activeLabId={scopeLabId}
                    onLabChange={setScopeLabId}
                    availableRings={isMe ? ["public", "lab", "private"] : ["public", "lab"]}
                    popover
                  />
                </div>
              </div>

              {profile.bio ? (
                <p style={{ fontSize: 14, color: v2.t2, lineHeight: 1.7, margin: "18px 0 0", whiteSpace: "pre-wrap", maxWidth: 520 }}>{translatedBio}</p>
              ) : isMe ? (
                <a href="/settings" style={{ fontSize: 13, color: v2.t3, textDecoration: "none", fontStyle: "italic", display: "inline-block", marginTop: 18 }}>{t("profilePage.addBioCta")}</a>
              ) : (
                <span style={{ fontSize: 13, color: v2.t3, fontStyle: "italic", display: "inline-block", marginTop: 18 }}>{t("profilePage.noBio")}</span>
              )}

              {/* Мои шкалы + Точность прогнозов */}
              <div style={{ display: "flex", gap: isMobile ? 14 : 20, marginTop: isMobile ? 20 : 30, flexWrap: "wrap" }}>
                <div style={{ flex: isMobile ? "1 1 100%" : "1 1 260px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: isMobile ? 14 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: v2.t1, marginBottom: 4 }}>{t("profilePage.myScalesTitle")}</div>
                  <div style={{ fontSize: 11.5, color: v2.t3, marginBottom: 6, lineHeight: 1.5 }}>{t("profilePage.myScalesSubtitle")}</div>
                  <RadarChart data={stats?.radar ?? []} t={t} />
                </div>
                <div style={{ flex: isMobile ? "1 1 100%" : "1 1 260px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: isMobile ? 14 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: v2.t1, marginBottom: 4 }}>{t("profilePage.calibrationTitle")}</div>
                  <div style={{ fontSize: 11.5, color: v2.t3, marginBottom: 10, lineHeight: 1.5 }}>{t("profilePage.calibrationSubtitle")}</div>
                  <CalibrationSummary summary={stats?.calibration_summary ?? null} t={t} />
                  <CalibrationChart data={stats?.calibration ?? []} t={t} />
                </div>
              </div>
            </div>
          </div>

          {/* TICKER */}
          <div style={{ display: "flex", alignItems: "stretch", margin: "0 0 24px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: isMobile ? "auto" : "hidden", background: "rgba(255,255,255,0.015)", minWidth: 0 }}>
            {ENTITY_ITEMS.map(item => (
              <a key={item.key} href={item.href} style={{ flex: isMobile ? "0 0 auto" : 1, minWidth: isMobile ? 96 : undefined, padding: "16px 18px", textDecoration: "none", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                <item.icon size={13} style={{ color: item.color, marginBottom: 10, display: "block" }} />
                <div style={{ fontSize: 24, fontWeight: 800, color: v2.t1, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {stats?.totals?.[item.key] ?? "—"}
                </div>
                <div style={{ fontSize: 10, color: v2.t3, marginTop: 6 }}>{t(item.labelKey).toUpperCase()}</div>
              </a>
            ))}
          </div>

          {/* FINGERPRINT */}
          <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "22px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(135deg, #4dcfa6, #8b80f0)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: v2.t1 }}>{t("profilePage.fingerprintTitle")}</span>
              <span style={{ fontSize: 10, color: v2.t3, marginLeft: "auto" }}>{t("profilePage.fingerprintTotal", { n: fpTotal })}</span>
            </div>
            <div style={{ fontSize: 11.5, color: v2.t3, margin: "0 0 16px 14px" }}>{t("profilePage.fingerprintSubtitle")}</div>
            {fpTotal === 0 ? (
              <div style={{ fontSize: 11, color: v2.t3, fontStyle: "italic" }}>{t("profilePage.fingerprintInsufficientData")}</div>
            ) : (
              <>
                <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 3, marginBottom: 12 }}>
                  {fp.confirmed > 0 && <div style={{ flex: fp.confirmed, background: "linear-gradient(90deg,#27AE60,#2ECC71)", borderRadius: 6 }} />}
                  {fp.pending > 0 && <div style={{ flex: fp.pending, background: "linear-gradient(90deg,#E8A84E,#F5A623)", borderRadius: 6 }} />}
                  {fp.rejected > 0 && <div style={{ flex: fp.rejected, background: "linear-gradient(90deg,#E05B5B,#c94444)", borderRadius: 6 }} />}
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {[[t("profilePage.confirmedLabel"), fp.confirmed, "#2ECC71"], [t("profilePage.pendingLabel"), fp.pending, "#F5A623"], [t("profilePage.rejectedLabel"), fp.rejected, "#E05B5B"]].map(([label, val, color]: any) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                      <span style={{ fontSize: 10.5, color: v2.t3 }}>{label}</span>
                      <span style={{ fontSize: 10.5, color: v2.t2, fontWeight: 600 }}>{val} · {Math.round(val / fpTotal * 100)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* THINKING PATTERNS */}
          {isMe && thinkingPatterns.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(135deg, #8b80f0, #4dcfa6)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: v2.t1 }}>{t("profilePage.thinkingPatternsTitle")}</span>
                <span style={{ fontSize: 10, color: v2.t3, marginLeft: "auto" }}>
                  {(() => { const f = ruPluralForm(thinkingPatterns.length); return t(f === "one" ? "profilePage.patternsOne" : f === "few" ? "profilePage.patternsFew" : "profilePage.patternsMany", { n: thinkingPatterns.length }) })()}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: v2.t3, margin: "0 0 14px 14px" }}>
                {t("profilePage.thinkingPatternsSubtitle")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {thinkingPatterns.map((p: any) => (
                  <div key={p.id} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 22px" }}>
                    <div style={{ fontSize: 10, color: v2.t3, marginBottom: 10 }}>
                      {new Date(p.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} · {t("profilePage.patternBasedOn", { n: p.based_on_count })}
                    </div>
                    <div style={{ fontSize: 13.5, color: v2.t2, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{p.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HEATMAP */}
          <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "22px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#4dcfa6)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: v2.t1 }}>{t("profilePage.activityTitle")}</span>
              <span style={{ fontSize: 10, color: v2.t3, marginLeft: "auto" }}>{t("profilePage.activityLast150Days")}</span>
            </div>
            <div style={{ fontSize: 11.5, color: v2.t3, margin: "4px 0 0 14px" }}>{t("profilePage.activitySubtitle")}</div>
            <ActivityHeatmap activity={stats?.activity ?? []} t={t} />
          </div>

          {/* RECENT / EMPTY — эпистемическая нить: узлы по типу сущности вдоль вертикальной линии */}
          {(() => {
            const recent = stats?.recent as Record<string, { id: number; slug: string; title: string; created_at: string; href: string }[]> | undefined
            const totalsSum = Object.values(stats?.totals ?? {}).reduce((a: number, b: any) => a + (b || 0), 0)
            const recentSum = Object.values(recent ?? {}).reduce((a, list) => a + list.length, 0)
            if (totalsSum === 0 && recentSum === 0) {
              return (
                <div style={{ borderRadius: 14, border: "1px dashed rgba(255,255,255,0.09)", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: v2.t3, textAlign: "center" }}>
                  <CheckCircle2 size={20} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: 13 }}>{t("profilePage.emptyActivityTitle")}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{t("profilePage.emptyActivitySubtitle")}</span>
                </div>
              )
            }
            return (
              <>
                {ENTITY_ITEMS.map(item => {
                  const list = recent?.[item.key] ?? []
                  if (list.length === 0) return null
                  return (
                    <div key={item.key} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 22px 18px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: v2.t1 }}>{t(item.labelKey)}</span>
                        <span style={{ fontSize: 10, color: v2.t3 }}>{list.length}</span>
                        <Link href={item.href} style={{ fontSize: 10.5, color: v2.t3, marginLeft: "auto", textDecoration: "none" }}>{t("profilePage.viewAllLink")}</Link>
                      </div>

                      <div style={{ position: "relative", paddingLeft: 18 }}>
                        <div style={{ position: "absolute", left: 3, top: 4, bottom: 4, width: 1, background: `linear-gradient(180deg, ${item.color}55, ${item.color}10)` }} />
                        {list.map((entry, i) => (
                          <Link key={entry.id} href={entry.href} style={{
                            position: "relative", display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 0", textDecoration: "none",
                          }}>
                            <span style={{
                              position: "absolute", left: -18, width: 7, height: 7, borderRadius: "50%",
                              background: v2.bg, border: `1.5px solid ${item.color}`, transition: "box-shadow 0.15s",
                            }} className="group-hover:shadow" />
                            <span style={{ flex: 1, fontSize: 12.5, color: v2.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recentTrFns[item.key](entry, recentTrField[item.key], entry.title)}</span>
                            <span style={{ fontSize: 10, color: v2.t3, flexShrink: 0, fontFamily: "monospace" }}>{relativeTime(t, entry.created_at)}</span>
                          </Link>
                        ))}
                      </div>

                      <p style={{ fontSize: 10.5, color: v2.t3, fontStyle: "italic", opacity: 0.6, margin: "14px 0 0", paddingLeft: 18 }}>
                        {t(SECTION_QUOTE_KEY[item.key])}
                      </p>
                    </div>
                  )
                })}
              </>
            )
          })()}

        </div>
      </PageContent>
    </PageShell>
  )
}
