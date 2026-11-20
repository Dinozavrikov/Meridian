"use client"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { useQuery } from "@tanstack/react-query"
import { statsApi } from "@/lib/api"
import { Header } from "@/components/layout/header"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { statusColor } from "@/lib/theme"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { buildPieData, type PieDatum } from "@/lib/stats-chart"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

const RADIAN = Math.PI / 180
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- форму props задаёт recharts (PieLabelRenderProps)
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10}>{`${(percent*100).toFixed(0)}%`}</text>
}

const tooltipStyle = { contentStyle: { background: "#181818", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 12, color: "#e0e0e0" } }

const STATS_KEY_LABEL: Record<string, string> = {
  observations: "nav.data.observations",
  hypotheses:   "nav.data.hypotheses",
  predictions:  "nav.data.predictions",
  worldview:    "nav.data.worldview",
  questions:    "nav.data.questions",
  tasks:        "nav.analysis.tasks",
}

function PieCard({ title, data }: { title: string; data: PieDatum[] }) {
  return (
    <div style={{ background: "#151515", border: "1px solid #222", borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "#c0c0c0", marginBottom: 16 }}>{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} labelLine={false} label={renderLabel}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#9a9a9a" }}>{d.name} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatsPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const { data, isLoading } = useQuery({ queryKey: ["stats"], queryFn: statsApi.get })
  // Названия статусов приходят с API по-русски и задаются системой — переводятся динамическим каналом
  // (как в StatusBadge). Хук вызывается ДО раннего return: порядок хуков не должен зависеть от загрузки.
  const statusNames = Array.from(new Set([
    ...Object.keys(data?.hyp_by_status ?? {}),
    ...Object.keys(data?.pred_by_status ?? {}),
    ...Object.keys(data?.wv_by_status ?? {}),
  ]))
  const dt = useDynamicTranslate(statusNames, { noYo: true })

  if (isLoading) return (
    <PageShell>
      <Header titleKey="page.stats.title" />
      <PageContent noPadding>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ padding: isMobile ? "16px 12px" : "20px 28px", gap: 12 }}>
          {[...Array(6)].map((_,i) => <div key={i} style={{ height: 100, borderRadius: 12, background: "#151515", border: "1px solid #1e1e1e" }} />)}
        </div>
      </PageContent>
    </PageShell>
  )

  const hypPie  = buildPieData(data?.hyp_by_status,  dt, statusColor)
  const predPie = buildPieData(data?.pred_by_status, dt, statusColor)
  const wvPie   = buildPieData(data?.wv_by_status,   dt, statusColor)
  const obsBar  = (data?.obs_monthly ?? []).map((r: { m?: string; n: number }) => ({ m: r.m?.slice(0, 7), n: r.n }))

  return (
    <PageShell>
      <Header titleKey="page.stats.title" />
      <PageContent noPadding>
      <div style={{ padding: isMobile ? "16px 12px" : 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* totals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: 10 }}>
          {Object.entries(data?.totals ?? {}).map(([key, val]) => (
            <div key={key} style={{ background: "#151515", border: "1px solid #222", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 26, fontWeight: 700, color: "#e2e2e2" }}>{val as number}</p>
              <p style={{ fontSize: 11, color: "#979797", marginTop: 4 }}>{t(STATS_KEY_LABEL[key] ?? key)}</p>
            </div>
          ))}
        </div>

        {/* accuracy */}
        <div style={{ background: "#151515", border: "1px solid #222", borderRadius: 12, padding: 20, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 24 }}>
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: (data?.pred_accuracy ?? 0) >= 50 ? "#27AE60" : "#F5A623" }}>
              {data?.pred_accuracy ?? 0}%
            </p>
            <p style={{ fontSize: 12, color: "#979797", marginTop: 6 }}>{t("stats.accuracy.label")}</p>
          </div>
          <div style={{ width: isMobile ? "100%" : 1, height: isMobile ? 1 : 60, background: "#222", flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "#9a9a9a", lineHeight: 1.7 }}>
            {t("stats.accuracy.description")}
          </p>
        </div>

        {/* pies */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 12 }}>
          {hypPie.length  > 0 && <PieCard title={t("stats.pie.hypotheses")}  data={hypPie}  />}
          {predPie.length > 0 && <PieCard title={t("stats.pie.predictions")}  data={predPie} />}
          {wvPie.length   > 0 && <PieCard title={t("stats.pie.worldview")} data={wvPie}   />}
        </div>

        {/* bar */}
        {obsBar.length > 0 && (
          <div style={{ background: "#151515", border: "1px solid #222", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#c0c0c0", marginBottom: 16 }}>{t("stats.bar.observationsMonthly")}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={obsBar} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#444" }} />
                <YAxis tick={{ fontSize: 11, fill: "#444" }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="n" fill="#4A90D9" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      </PageContent>
    </PageShell>
  )
}
