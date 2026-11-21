import { describe, it, expect } from "vitest"
import { SITE_NAME } from "@/lib/page-meta"
import { metadata as feed } from "@/app/(app)/feed/layout"
import { metadata as docs } from "@/app/(app)/docs/layout"
import { metadata as features } from "@/app/(app)/features/layout"
import { metadata as labs } from "@/app/(app)/labs/layout"
import { metadata as privacy } from "@/app/(app)/privacy/layout"
import { metadata as questions } from "@/app/(app)/questions/layout"
import { metadata as roadmap } from "@/app/(app)/roadmap/layout"
import { metadata as support } from "@/app/(app)/support/layout"
import { metadata as terms } from "@/app/(app)/terms/layout"
import { metadata as observations } from "@/app/(app)/observations/layout"
import { metadata as hypotheses } from "@/app/(app)/hypotheses/layout"
import { metadata as predictions } from "@/app/(app)/predictions/layout"
import { metadata as worldview } from "@/app/(app)/worldview/layout"

const pages = { feed, docs, features, labs, privacy, questions, roadmap, support, terms, observations, hypotheses, predictions, worldview }

describe("метаданные разделов", () => {
  it("у каждого раздела свой заголовок и свое описание", () => {
    for (const key of ["title", "description"] as const) {
      const values = Object.values(pages).map(m => String(m[key]))
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it.each(Object.entries(pages))("%s: canonical совпадает с адресом, есть OpenGraph с siteName и Twitter", (name, m) => {
    expect(m.alternates?.canonical).toBe(`/${name}`)
    expect(String(m.description ?? "").trim()).not.toBe("")
    expect(m.openGraph).toMatchObject({ siteName: SITE_NAME, url: `/${name}` })
    expect(m.twitter).toBeTruthy()
  })
})
