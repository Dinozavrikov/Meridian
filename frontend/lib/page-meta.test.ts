import { describe, it, expect } from "vitest"
import { pageMetadata, SITE_NAME } from "@/lib/page-meta"
import { metadata as docs } from "@/app/(app)/docs/layout"
import { metadata as features } from "@/app/(app)/features/layout"
import { metadata as labs } from "@/app/(app)/labs/layout"
import { metadata as privacy } from "@/app/(app)/privacy/layout"
import { metadata as questions } from "@/app/(app)/questions/layout"
import { metadata as roadmap } from "@/app/(app)/roadmap/layout"
import { metadata as support } from "@/app/(app)/support/layout"
import { metadata as terms } from "@/app/(app)/terms/layout"

describe("pageMetadata", () => {
  it("canonical, OpenGraph и Twitter строятся из одних и тех же заголовка, описания и адреса", () => {
    const m = pageMetadata("/labs", "page.labs.title", "meta.labs.description")
    expect(m.alternates?.canonical).toBe("/labs")
    expect(String(m.title).endsWith(` · ${SITE_NAME}`)).toBe(true)
    expect(m.openGraph).toMatchObject({ title: m.title, description: m.description, url: "/labs", siteName: SITE_NAME })
    expect(m.twitter).toMatchObject({ card: "summary", title: m.title, description: m.description })
  })
})

describe("публичные разделы", () => {
  const pages = { docs, features, labs, privacy, questions, roadmap, support, terms }
  it.each(Object.entries(pages))("%s: заголовок и описание не пустые (нет опечатки в ключе строки)", (_name, m) => {
    expect(String(m.title).replace(` · ${SITE_NAME}`, "").trim()).not.toBe("")
    expect(String(m.description ?? "").trim()).not.toBe("")
    expect(m.twitter).toBeTruthy()
  })
})
