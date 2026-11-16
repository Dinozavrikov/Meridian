"use client"
import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Sparkles, X } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ReflectionInsightPanel, ReflectionInsight } from "./reflection-insight-panel"
import { reflectionApiFor, ReflectionEntityType } from "@/lib/reflection-api"

interface ReflectionNudgeProps {
  entityType: ReflectionEntityType
  entityId: number
  accent: string
}

const STALE_DAYS = 7

/**
 * Закрывает п.1.3 из ревью: кнопка «промежуточный результат» доступна
 * всегда (когда есть что сравнивать — иначе backend вернёт 400 и мы
 * даже не показываем кнопку), а пассивный акцентный баннер с возможностью
 * скрыть появляется только если последняя версия факторов старше 7 дней —
 * система сама привлекает внимание, а не ждёт, пока пользователь вспомнит.
 * Скрытие — только на текущую сессию (не персистентно), сознательно просто:
 * не хотим городить отдельное поле/таблицу ради одного dismiss-флага.
 */
export function ReflectionNudge({ entityType, entityId, accent }: ReflectionNudgeProps) {
  const t = useT()
  const reflectionApi = reflectionApiFor(entityType)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [insight, setInsight] = useState<ReflectionInsight | null>(null)

  const { data: reflections = [] } = useQuery({
    queryKey: ["entity-reflections", entityType, entityId],
    queryFn: () => reflectionApi.listReflections(entityId),
  })
  // Уже посчитанный resolution-инсайт (если резолюция прошла и рефлексия
  // была на обеих стадиях) — считается один раз в BackgroundTask при close,
  // здесь просто подтягиваем готовый результат, не пересчитываем.
  // У Worldview стадии resolution не существует — listInsights всегда вернёт
  // пусто для triggeredBy="resolution", existingResolutionInsight будет undefined,
  // и компонент корректно падает на обычный manual-flow ниже.
  const { data: resolutionInsights = [] } = useQuery({
    queryKey: ["entity-insights", entityType, entityId, "resolution"],
    queryFn: () => reflectionApi.listInsights(entityId, "resolution"),
  })
  const existingResolutionInsight: ReflectionInsight | undefined = resolutionInsights[0]

  const creationVersions = reflections.filter((r: any) => r.stage === "creation")
  const hasEnoughVersions = creationVersions.length >= 2
  const latestCreation = creationVersions[creationVersions.length - 1]
  const isStale = latestCreation
    ? (Date.now() - new Date(latestCreation.created_at).getTime()) / 86400000 > STALE_DAYS
    : false

  const manualInsight = useMutation({
    mutationFn: () => reflectionApi.manualInsight(entityId),
    onSuccess: (data: ReflectionInsight) => { setInsight(data); setExpanded(true) },
  })

  // Готовый resolution-инсайт показываем сразу, без ручного триггера — он
  // уже посчитан, ждать/нажимать нечего. Приоритетнее ручного flow.
  if (existingResolutionInsight && !dismissed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ReflectionInsightPanel insight={existingResolutionInsight} entityType={entityType} entityId={entityId} />
      </div>
    )
  }

  if (!hasEnoughVersions || dismissed) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!expanded && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8,
          background: isStale ? `${accent}10` : "transparent",
          border: isStale ? `1px solid ${accent}30` : "1px solid #1e1e2c",
        }}>
          <Sparkles size={14} style={{ color: accent, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: isStale ? accent : "#9999ad", flex: 1 }}>
            {isStale ? t("reflectionNudge.staleHint") : t("reflectionNudge.hint")}
          </span>
          <Button variant="ghost" size="sm" onClick={() => manualInsight.mutate()} disabled={manualInsight.isPending}>
            {manualInsight.isPending ? t("reflectionNudge.comparingButton") : t("reflectionNudge.showButton")}
          </Button>
          {isStale && (
            <button type="button" onClick={() => setDismissed(true)} style={{ color: "#9696aa", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      {manualInsight.isError && !expanded && (
        <ReflectionInsightPanel insight={null} error onRetry={() => manualInsight.mutate()} />
      )}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ReflectionInsightPanel insight={insight} entityType={entityType} entityId={entityId} />
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} className="self-start">{t("reflectionNudge.collapse")}</Button>
        </div>
      )}
    </div>
  )
}
