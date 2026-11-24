// Главная страница: единый список пунктов и ключи текстов. Сами тексты лежат в lib/i18n/strings.ts (sitePage.home.*).
export const HOME_POINTS = ["maturity", "blind", "calibration"] as const
export type HomePointId = (typeof HOME_POINTS)[number]

export const HOME_KEYS = {
  title: "sitePage.home.title",
  lead: "sitePage.home.lead",
  ctaRegister: "sitePage.home.cta.register",
  ctaLogin: "sitePage.home.cta.login",
  ctaApp: "sitePage.home.cta.app",
  privacy: "sitePage.home.privacy",
} as const

export const pointKeys = (id: HomePointId) => ({
  title: `sitePage.home.point.${id}.title`,
  text: `sitePage.home.point.${id}.text`,
})

/** Заголовок первого пункта, пока число уровней едет с сервера (модель зрелости): без числа, чтобы не показывать пустые места. */
export const MATURITY_PENDING_KEY = "sitePage.home.point.maturity.titlePending"

/** Все ключи, которые обязаны существовать для данных этого файла. */
export const DATA_KEYS: string[] = [
  ...Object.values(HOME_KEYS),
  ...HOME_POINTS.flatMap(id => Object.values(pointKeys(id))),
  MATURITY_PENDING_KEY,
]
