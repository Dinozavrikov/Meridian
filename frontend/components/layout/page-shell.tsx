import { Footer } from "./footer"

interface PageShellProps { children: React.ReactNode; fixedHeight?: boolean }
interface PageContentProps {
  children: React.ReactNode
  style?: React.CSSProperties
  noPadding?: boolean
  overflow?: "auto" | "hidden" | "visible"
}

// Footer — последний элемент flex-колонки, но колонка задаётся через
// min-height:100vh, а не height:100vh. Это классический CSS-приём
// "sticky footer": если контента мало — PageContent (flex:1 0 auto)
// растягивается, и Footer остаётся у нижнего края экрана без некрасивого
// пустого промежутка. Если контента много — колонка вырастает выше
// экрана вместе с контентом, и Footer оказывается в конце документа,
// как и должно быть: до него нужно доскроллить.
// Раньше здесь стоял height:100vh — из-за этого Footer был всегда
// прибит к нижней кромке вьюпорта на ЛЮБОЙ странице (дашборд, задачи,
// гипотезы и т.п.), даже когда контента было намного больше экрана.
// ВАЖНО: страницы со своей внутренней сплит-панелью (задачи, сообщения, гипотезы) высоту через
// calc(100vh - 52px) НЕ задают (проверено grep'ом по app/ и components/): каркас сплит-страниц —
// SPLIT_BODY_STYLE (ниже), а не абсолютная высота от вьюпорта.
export function PageShell({ children, fixedHeight }: PageShellProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      ...(fixedHeight ? { height: "100vh", overflow: "hidden" } : { minHeight: "100vh" }),
      background: "#0b0d14",
    }}>
      {children}
      <Footer />
    </div>
  )
}

export function PageContent({ children, style, noPadding, overflow = "auto" }: PageContentProps) {
  return (
    <div style={{
      flex: "1 0 auto", minHeight: 0,
      // visible: без своей прокрутки (иначе sticky внутри прилипает к этому блоку, а не к окну); clip по X не создаёт контейнер прокрутки
      overflowY: overflow, overflowX: overflow === "visible" ? "clip" : "hidden",
      padding: noPadding ? 0 : "20px 28px",
      display: "flex", flexDirection: "column",
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Корень страницы со сплит-панелью (список + деталь) внутри <PageContent noPadding>. Растягивается на всю высоту
 *  PageContent через flex, а НЕ через height/minHeight: "100%": у PageShell высота не задана (только minHeight: 100vh),
 *  проценты в таком каркасе не считаются, и при коротком содержимом (0 прогнозов, одна задача) фон панелей обрывался
 *  на высоте контента, а ниже просвечивал фон страницы. Защита: lib/split-layout.test.ts. */
export const SPLIT_BODY_STYLE: React.CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
