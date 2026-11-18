/** Адреса проекта: единый источник для подвала, страницы поддержки и ссылок в тексте. */
/** Атрибуты внешних ссылок: nofollow не передает им вес сайта, noopener и noreferrer закрывают доступ к окну-источнику. */
export const EXTERNAL_LINK_PROPS = { target: "_blank", rel: "nofollow noopener noreferrer" } as const

export const REPO_URL = "https://github.com/Dinozavrikov/Meridian"
export const ISSUES_URL = `${REPO_URL}/issues`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
