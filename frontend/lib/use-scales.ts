"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { scalesApi } from "@/lib/api"
import { DEFAULT_SCALES, type Scale } from "@/lib/scales"

/** Все шкалы для типа сущности: встроенные (с учётом переопределений описаний)
 *  + кастомные, заведённые пользователем на /scales. */
export function useEntityScales(entityType: string) {
  const customQ = useQuery({
    queryKey: ["scales", "custom", entityType],
    queryFn: () => scalesApi.listCustom(entityType),
  })
  const overridesQ = useQuery({
    queryKey: ["scales", "builtin-overrides"],
    queryFn: () => scalesApi.getBuiltinOverrides(),
  })

  const builtin: Scale[] = DEFAULT_SCALES
    .filter(s => s.entity_type === entityType)
    .map(s => {
      const override = overridesQ.data?.[s.id]
      return override && override.length > 0 ? { ...s, levels: override } : s
    })

  const custom: (Scale & { _defId: number })[] = (customQ.data ?? []).map((d: any) => ({
    id: `custom_${d.id}`, _defId: d.id, name: d.name, entity_type: d.entity_type,
    min: d.min_val, max: d.max_val, step: d.step, group_by: d.group_by,
    color: d.color, builtin: false, description: d.description, levels: d.levels,
  }))

  return {
    scales: [...builtin, ...custom],
    isLoading: customQ.isLoading || overridesQ.isLoading,
  }
}

/** Значения шкал сущности: встроенные приходят как поля самой сущности (builtinValues),
 *  кастомные — из таблицы scale_values, подтягиваются и патчатся отдельно. */
export function useScaleValues(entityType: string, entityId: number | undefined, builtinValues: Record<string, any>) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["scale-values", entityType, entityId],
    queryFn: () => scalesApi.getValues(entityType, entityId as number),
    enabled: entityId != null,
  })

  const setCustom = useMutation({
    mutationFn: ({ scaleId, value }: { scaleId: string; value: number | null }) =>
      scalesApi.setValue(entityType, entityId as number, scaleId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scale-values", entityType, entityId] }),
  })

  return {
    values: { ...builtinValues, ...(q.data ?? {}) },
    setCustomValue: (scaleId: string, value: number | null) => setCustom.mutate({ scaleId, value }),
    isPending: setCustom.isPending,
  }
}
