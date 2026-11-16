// frontend/lib/create-hypothesis.ts — «создать гипотезу целиком» (см. create-entity-full.ts).
// buildUpdate отдаёт ПОЛНОЕ тело PUT: у гипотез бэкенд, в отличие от прогнозов, непришедшие поля
// не страхует (HypUpdate сбросил бы их в умолчания схемы).
import { hypApi } from "@/lib/api"
import { makeCreateFull } from "@/lib/create-entity-full"
import type { EntitySubmit } from "@/lib/entity-submit"

export type HypothesisSubmit = EntitySubmit

export const createHypothesisFull = makeCreateFull({
  entityType: "hypothesis",
  api: hypApi,
  textField: "description",
  buildUpdate: (c, description) => ({
    name: c.name, description, falsification_criteria: c.falsification_criteria,
    date_created: c.date_created, status: c.status, maturity: c.maturity, tags: c.tags ?? [],
    visibility: c.visibility, lab_id: c.lab_id,
    stability: c.stability, research_load: c.research_load, risk: c.risk,
  }),
})
