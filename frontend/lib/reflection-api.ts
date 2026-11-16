import { predApi, wvApi, obsApi } from "@/lib/api"

export type ReflectionEntityType = "prediction" | "worldview" | "observation"

export interface ReflectionApi {
  addReflection: (id: number, d: { stage: "creation" | "resolution"; factors: any[]; raw_dialogue_text?: string }) => Promise<any>
  listReflections: (id: number) => Promise<any>
  manualInsight: (id: number) => Promise<any>
  listInsights: (id: number, triggeredBy?: "manual" | "resolution") => Promise<any>
  reflectionQuestion: (id: number, insightId: number) => Promise<any>
}

// Prediction и Worldview намеренно имеют идентичную форму reflection-методов
// (полиморфные entity_type/entity_id на бэкенде) — это единственное место,
// где выбирается конкретный api-объект; компоненты выше по стеку entity-агностичны.
const REFLECTION_API: Record<ReflectionEntityType, ReflectionApi> = {
  prediction: predApi,
  worldview: wvApi,
  observation: obsApi,
}

export function reflectionApiFor(entityType: ReflectionEntityType): ReflectionApi {
  return REFLECTION_API[entityType]
}
