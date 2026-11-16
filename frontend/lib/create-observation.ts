// frontend/lib/create-observation.ts — «создать наблюдение целиком» (см. create-entity-full.ts):
// страница, вкладка лаборатории и quick-add зовут одну и ту же функцию.
import { obsApi } from "@/lib/api"
import { makeCreateFull } from "@/lib/create-entity-full"
import type { EntitySubmit } from "@/lib/entity-submit"

export type ObservationSubmit = EntitySubmit

export const createObservationFull = makeCreateFull({
  entityType: "observation",
  api: obsApi,
  textField: "text",
  // importance шлём всегда как есть (null = «не оценено»): значимость из формы — источник истины
  buildUpdate: (c, text) => ({
    date: c.date, author: c.author, title: c.title, text, tags: c.tags ?? [], status: c.status,
    importance: c.importance, visibility: c.visibility, lab_id: c.lab_id,
  }),
})
