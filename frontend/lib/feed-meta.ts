// Единый источник данных о типах сущностей для всего, что связано с лентой и обсуждением —
// раньше эти карты дублировались только внутри feed-card.tsx.

export const FEED_TYPE_META: Record<string, { href: string }> = {
  observation: { href: "/observations" },
  hypothesis:  { href: "/hypotheses" },
  prediction:  { href: "/predictions" },
  worldview:   { href: "/worldview" },
  question:    { href: "/questions" },
  task:        { href: "/tasks" },
  obs_post:    { href: "/feed" },
}
