"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import * as d3 from "d3"
import { typeColor, theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { fitTransform } from "@/lib/graph-fit"
import { nodeLabel, labelPriority, pickVisibleLabels, labelScale, type LabelBox } from "@/lib/graph-label"
import { shapeFor, shapeToSvgPath, edgeColorFor, edgeLabelKeyFor, edgeDescriptionKeyFor } from "@/lib/graph-visuals"
import { MENTION_LEGEND_KEY, MENTION_DESCRIPTION_KEY } from "@/lib/graph-mention"

export interface ForceGraphNode {
  /** уникальный ключ узла в рамках графа (не entity id — на случай коллизий между типами) */
  id: string
  label: string
  type: string
  entityId: number
  isCenter?: boolean
  /** тип связи с центром/родителем, влияет на цвет входящего ребра */
  linkType?: string
  /** статус сущности, для отображения в превью (опционально, не все типы его имеют) */
  status?: string | null
  /** доп. поля для частных случаев (например вердикт/вес источника в графе задачи) */
  /** дата сущности (наблюдение): показывается в тултипе, подпись узла — название */
  date?: string
  verdict?: string
  weight?: number
  /** узел открыт зрителю через связь с лабораторной записью (не лабораторный) */
  opened?: boolean
}

export interface ForceGraphEdge {
  source: string
  target: string
  linkType?: string
  /** упоминание в тексте записи, а не связь: серый пунктир, своя подпись в подсказке */
  mention?: boolean
}

export interface ForceGraphProps {
  nodes: ForceGraphNode[]
  edges: ForceGraphEdge[]
  /** если true — узел с isCenter фиксируется в центре холста и не участвует в физике разлёта */
  fixedCenter?: boolean
  nodeRadius?: number
  centerRadius?: number
  /** если false — все узлы рисуются простыми кругами (глобальный/личный граф), иначе — формы по типу сущности */
  shapes?: boolean
  onNodeClick?: (node: ForceGraphNode) => void
  className?: string
  style?: React.CSSProperties
  /** переопределяет цвет узла вместо типового (например, цвет по вердикту источника) */
  colorForNode?: (node: ForceGraphNode) => string
  /** переопределяет радиус узла вместо nodeRadius/centerRadius */
  radiusForNode?: (node: ForceGraphNode) => number
  /** переопределяет цвет ребра вместо edgeColorFor(linkType) */
  colorForEdge?: (edge: ForceGraphEdge) => string
  /** переопределяет пунктир ребра; null/undefined — сплошная линия */
  dashForEdge?: (edge: ForceGraphEdge) => string | null | undefined
  /** выделение узлов: "on" крупнее и со свечением, "off" приглушён; пока нет ни одного "on", выделения нет */
  emphasis?: (node: ForceGraphNode) => "on" | "off" | undefined
  /** не рисовать собственную кнопку «Показать весь граф»: её держит владелец графа (см. onFitReady) */
  hideFitButton?: boolean
  /** отдаёт наружу действие «показать весь граф»; null при размонтировании */
  onFitReady?: (fit: (() => void) | null) => void
}

interface HoverInfo {
  x: number; y: number
  kind: "node" | "edge"
  node?: ForceGraphNode
  edge?: ForceGraphEdge
}

export function ForceGraph({
  nodes: nodesProp, edges: edgesProp, fixedCenter = false,
  nodeRadius = 8, centerRadius = 16, shapes = true,
  onNodeClick, className, style,
  colorForNode, radiusForNode, colorForEdge, dashForEdge, emphasis, hideFitButton, onFitReady }: ForceGraphProps) {
  const typeRu = useTypeRu()
  // Родитель пересоздаёт массивы на каждый рендер; пересобирать d3-сцену нужно только при смене состава
  const nk = nodesProp.map(n => n.id + "\t" + n.label).join("\n")
  const ek = edgesProp.map(e => e.source + "\t" + e.target + "\t" + (e.linkType ?? "") + (e.mention ? "\tmention" : "")).join("\n")
  const stableRef = useRef<{ nk: string; ek: string; nodes: ForceGraphNode[]; edges: ForceGraphEdge[] } | null>(null)
  if (!stableRef.current || stableRef.current.nk !== nk || stableRef.current.ek !== ek) {
    stableRef.current = { nk, ek, nodes: nodesProp, edges: edgesProp }
  }
  const nodes = stableRef.current.nodes
  const edges = stableRef.current.edges
  const colorRef = useRef(colorForNode)
  colorRef.current = colorForNode
  const emphasisRef = useRef(emphasis)
  emphasisRef.current = emphasis
  const restyleRef = useRef<(() => void) | null>(null)
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  // переживают переинициализацию d3-эффекта (например, при пересоздании
  // массивов nodes/edges после открытия/закрытия модалки предпросмотра),
  // чтобы граф не "прыгал" обратно в исходное положение
  const transformRef = useRef<d3.ZoomTransform | null>(null)
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const fitRef = useRef<(() => void) | null>(null)
  // владелец графа получает fit() наружу: кнопка «Показать весь граф» может жить в его панели
  useEffect(() => {
    onFitReady?.(() => fitRef.current?.())
    return () => onFitReady?.(null)
  }, [onFitReady])

  const colorFor = useCallback((type: string) => (typeColor as any)[type] ?? "#7070a0", [])

  useEffect(() => {
    const container = containerRef.current
    const svgEl = svgRef.current
    if (!container || !svgEl) return

    const W = container.clientWidth || 600
    const H = container.clientHeight || 400

    const svg = d3.select(svgEl)
    svg.selectAll("*").remove()
    svg.attr("width", W).attr("height", H)

    if (nodes.length === 0) return

    // лёгкий радиальный туман — атмосфера графа
    const defs = svg.append("defs")
    const fog = defs.append("radialGradient").attr("id", "fg-fog")
    fog.append("stop").attr("offset", "0%").attr("stop-color", "#4A90D9").attr("stop-opacity", 0.06)
    fog.append("stop").attr("offset", "100%").attr("stop-color", "#4A90D9").attr("stop-opacity", 0)
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "url(#fg-fog)")

    const g = svg.append("g")
    // подписи пересчитываются из тика и зума; пока нет данных узлов, это пустышка
    let relayout: (k: number) => void = () => {}
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on("zoom", e => { transformRef.current = e.transform; g.attr("transform", e.transform); restyleRef.current ? restyleRef.current() : relayout(e.transform.k) })
    svg.call(zoomBehavior)
    if (transformRef.current) {
      svg.call(zoomBehavior.transform, transformRef.current)
    }

    const nodeData = nodes.map(n => {
      const saved = positionsRef.current.get(n.id)
      return saved ? { ...n, x: saved.x, y: saved.y } : { ...n }
    })
    const byId = Object.fromEntries(nodeData.map(n => [n.id, n]))
    const linkData = edges
      .filter(e => byId[e.source] && byId[e.target])
      .map(e => ({ ...e }))

    const sim = d3.forceSimulation(nodeData as any)
      .force("link", d3.forceLink(linkData as any).id((d: any) => d.id).distance(fixedCenter ? 95 : 110))
      .force("charge", d3.forceManyBody().strength(-240))
      .force("center", fixedCenter ? null : d3.forceCenter(W / 2, H / 2))
      .force("gx", fixedCenter ? null : d3.forceX(W / 2).strength(0.04))
      .force("gy", fixedCenter ? null : d3.forceY(H / 2).strength(0.04))
      .force("collision", d3.forceCollide((d: any) => (d.isCenter ? centerRadius : nodeRadius) + 14))

    // позиции уже известны (смена режима, перерисовка): не встряхиваем граф с полной энергией
    if (nodeData.length > 0 && nodeData.every((d: any) => positionsRef.current.has(d.id))) sim.alpha(0.05)

    if (fixedCenter) {
      const center = nodeData.find(n => n.isCenter) as any
      if (center) {
        center.fx = W / 2
        center.fy = H / 2
      }
    }

    const link = g.append("g").selectAll("path").data(linkData).join("path")
      .attr("fill", "none")
      .attr("stroke", (d: any) => colorForEdge ? colorForEdge(d) : edgeColorFor(d.linkType))
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.7)
      .attr("stroke-dasharray", (d: any) => (dashForEdge ? dashForEdge(d) : (d.linkType === "опровергает" ? "4,3" : null)) ?? null)

    // невидимая широкая "полоса захвата" поверх каждой линии — тонкую линию иначе
    // невозможно точно навести мышью; отсюда же берём подсветку и тултип связи
    const linkHit = g.append("g").selectAll("path").data(linkData).join("path")
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 14)
      .attr("cursor", "pointer")
      .on("mouseenter", function (e, d: any) {
        link.filter((ld: any) => ld === d).attr("stroke-opacity", 1).attr("stroke-width", 2.5)
        const rect = container.getBoundingClientRect()
        setHover({ kind: "edge", edge: d, x: e.clientX - rect.left, y: e.clientY - rect.top })
      })
      .on("mousemove", function (e, d: any) {
        const rect = container.getBoundingClientRect()
        setHover({ kind: "edge", edge: d, x: e.clientX - rect.left, y: e.clientY - rect.top })
      })
      .on("mouseleave", function (e, d: any) {
        link.filter((ld: any) => ld === d).attr("stroke-width", 1.5)
        restyleRef.current?.()
        setHover(null)
      })

    const node = g.append("g").selectAll("g").data(nodeData).join("g")
      .attr("cursor", "pointer")

    const drag = d3.drag<any, any>()
      .clickDistance(4) // клик засчитывается только если движение меньше 4px — снимает конфликт drag/click
      .on("start", (e, d: any) => {
        if (!e.active) sim.alphaTarget(0.25).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on("drag", (e, d: any) => { d.fx = e.x; d.fy = e.y })
      .on("end", (e, d: any) => {
        if (!e.active) sim.alphaTarget(0)
        if (d.isCenter && fixedCenter) return
        d.fx = null; d.fy = null
      })
    node.call(drag as any)

    node.on("click", (_e, d: any) => onNodeClick?.(d))
    node.on("mouseenter", (e, d: any) => {
      const rect = container.getBoundingClientRect()
      setHover({ kind: "node", node: d, x: e.clientX - rect.left, y: e.clientY - rect.top })
    })
    node.on("mousemove", (e, d: any) => {
      const rect = container.getBoundingClientRect()
      setHover({ kind: "node", node: d, x: e.clientX - rect.left, y: e.clientY - rect.top })
    })
    node.on("mouseleave", () => setHover(null))

    node.each(function (d: any) {
      const el = d3.select(this)
      const r = radiusForNode ? radiusForNode(d) : (d.isCenter ? centerRadius : nodeRadius)
      const color = colorRef.current ? colorRef.current(d) : colorFor(d.type)
      const shape = shapes ? shapeFor(d.type) : "circle"
      const path = shapeToSvgPath(shape, 0, 0, r)

      if (shape === "ring") {
        el.append("circle").attr("r", r).attr("fill", `${color}28`).attr("stroke", color).attr("stroke-width", d.isCenter ? 2.5 : 1.4)
        el.append("circle").attr("r", r * 0.55).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1).attr("stroke-opacity", 0.7)
      } else if (path) {
        el.append("path").attr("d", path).attr("fill", `${color}${d.isCenter ? "28" : "18"}`).attr("stroke", color).attr("stroke-width", d.isCenter ? 2.5 : 1.2)
      } else {
        el.append("circle").attr("r", r).attr("fill", `${color}${d.isCenter ? "28" : "18"}`).attr("stroke", color).attr("stroke-width", d.isCenter ? 2.5 : 1.2)
      }

      if (d.opened) {
        el.append("circle")
          .attr("r", r + 3)
          .attr("fill", "none")
          .attr("stroke", theme.tx3)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "2 3")
          .attr("stroke-opacity", 0.7)
      }

      el.append("text")
        .attr("class", "fg-label")
        .text(nodeLabel(d))
        .attr("data-r", r)
        .attr("x", 0).attr("y", 12)
        .attr("stroke", "#0b0d17").attr("stroke-width", 3).attr("stroke-linejoin", "round").attr("paint-order", "stroke")
        .style("display", "none")
        .attr("text-anchor", "middle")
        .attr("font-size", d.isCenter ? "9px" : "8.5px")
        .attr("font-weight", d.isCenter ? "700" : "400")
        .attr("fill", d.isCenter ? "#d0d0f0" : "#9090b8")
        .style("font-family", "Inter, system-ui, sans-serif")
        .style("pointer-events", "none")
    })

    const degree = new Map<string, number>()
    edges.forEach(e => {
      const a = String(e.source), b = String(e.target)
      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
    })
    relayout = (k: number) => {
      const t = transformRef.current
      const f = labelScale(k)
      const emph = emphasisRef.current
      const act = !!emph && nodeData.some((d: any) => emph(d) === "on")
      const boxes: LabelBox[] = []
      nodeData.forEach((d: any) => {
        if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return
        if (act && emph!(d) === "off") return
        const fs = d.isCenter ? 9 : 8.5
        const r = radiusForNode ? radiusForNode(d) : (d.isCenter ? centerRadius : nodeRadius)
        boxes.push({
          id: d.id, x: d.x * k + (t?.x ?? 0), y: d.y * k + (t?.y ?? 0) + r * k + (12 - fs / 3) * f,
          w: nodeLabel(d).length * fs * 0.6 * f, h: (fs + 3) * f, priority: labelPriority(d, degree.get(d.id) ?? 0) + (act && emph!(d) === "on" ? 5_000_000 : 0),
        })
      })
      const shown = pickVisibleLabels(boxes)
      g.selectAll<SVGTextElement, any>("text.fg-label").each(function (d: any) {
        const r = Number(this.getAttribute("data-r")) || nodeRadius
        d3.select(this).style("display", shown.has(d.id) ? "" : "none")
          .attr("transform", `translate(0,${r}) scale(${f / k})`)
      })
    }
    fitRef.current = () => {
      const ft = fitTransform(nodeData as any[], W, H)
      if (!ft) return
      svg.transition().duration(400).call(zoomBehavior.transform as any, d3.zoomIdentity.translate(ft.x, ft.y).scale(ft.k))
    }
    // Раскраска и выделение без пересборки сцены: зовётся при смене colorForNode/emphasis и зума
    const restyle = () => {
      const k = transformRef.current?.k ?? 1
      const emph = emphasisRef.current
      const st = new Map<string, string | undefined>()
      nodeData.forEach((d: any) => st.set(d.id, emph ? emph(d) : undefined))
      const active = Array.from(st.values()).some(v => v === "on")
      const grow = Math.min(4, 1.6 * Math.max(1, 0.8 / k))
      node.each(function (this: any, d: any) {
        const s = active ? st.get(d.id) : undefined
        const color = colorRef.current ? colorRef.current(d) : colorFor(d.type)
        const el = d3.select(this)
        el.style("opacity", s === "off" ? "0.16" : "1")
        const sh = el.selectAll<SVGElement, unknown>("path, circle")
        sh.attr("stroke", color)
          .attr("stroke-width", s === "on" ? 3.2 : d.isCenter ? 2.5 : 1.4)
          .attr("transform", s === "on" ? `scale(${grow})` : "")
          .style("filter", s === "on" ? `drop-shadow(0 0 6px ${color})` : "")
        sh.filter(function (this: any) { return this.getAttribute("fill") !== "none" })
          .attr("fill", `${color}${s === "on" ? "99" : d.isCenter ? "28" : "18"}`)
      })
      link.attr("stroke-opacity", (l: any) => {
        if (!active) return 0.7
        const a = st.get(l.source.id ?? l.source), b = st.get(l.target.id ?? l.target)
        return a === "on" && b === "on" ? 0.95 : a === "on" || b === "on" ? 0.45 : 0.06
      })
      relayout(k)
    }
    restyleRef.current = restyle
    restyle()

    const pathFor = (d: any) => {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y
      const mx = (sx + tx) / 2, my = (sy + ty) / 2
      const dx = tx - sx, dy = ty - sy
      const dist = Math.hypot(dx, dy) || 1
      const bend = Math.min(18, dist * 0.12)
      const cx = mx + (-dy / dist) * bend
      const cy = my + (dx / dist) * bend
      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
    }
    sim.on("tick", () => {
      link.attr("d", pathFor)
      linkHit.attr("d", pathFor)
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`)
      relayout(transformRef.current?.k ?? 1)
      nodeData.forEach((d: any) => positionsRef.current.set(d.id, { x: d.x, y: d.y }))
    })

    return () => { sim.stop() }
  }, [nodes, edges, fixedCenter, nodeRadius, centerRadius, shapes, onNodeClick, colorFor, radiusForNode, colorForEdge, dashForEdge])

  useEffect(() => { restyleRef.current?.() }, [colorForNode, emphasis])

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {!hideFitButton && (
        <button type="button" onClick={() => fitRef.current?.()}
        style={{ position: "absolute", right: 12, top: 12, zIndex: 5, fontSize: 11.5, padding: "6px 11px", borderRadius: 7,
          border: "1px solid #2a2a3a", background: "#111420", color: "#9090b0", cursor: "pointer" }}>
        {t("graph.fit")}
      </button>
      )}
      {hover && hover.kind === "node" && hover.node && (
        <div style={{
          position: "absolute", left: hover.x + 14, top: hover.y - 10,
          background: "#0d0d1a", border: `1px solid ${colorFor(hover.node.type)}40`,
          borderRadius: 7, padding: "6px 11px", pointerEvents: "none",
          maxWidth: 260, zIndex: 10,
        }}>
          <span style={{ fontSize: 11, color: colorFor(hover.node.type), fontWeight: 600, whiteSpace: "nowrap" }}>{typeRu[hover.node.type] ?? hover.node.type}</span>
          <span style={{ fontSize: 11, color: "#9393b5", marginLeft: 6, whiteSpace: "normal", wordBreak: "break-word" }}>{hover.node.label}</span>{hover.node.date ? <span style={{ fontSize: 10.5, color: "#9393be", marginLeft: 8, whiteSpace: "nowrap" }}>{hover.node.date}</span> : null}
        </div>
      )}
      {hover && hover.kind === "edge" && hover.edge && (() => {
        const c = colorForEdge ? colorForEdge(hover.edge) : edgeColorFor(hover.edge.linkType)
        return (
          <div style={{
            position: "absolute", left: hover.x + 14, top: hover.y - 10,
            background: "#0d0d1a", border: `1px solid ${c}40`,
            borderRadius: 7, padding: "6px 11px", pointerEvents: "none",
            maxWidth: 240, zIndex: 10,
          }}>
            <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{t(hover.edge.mention ? MENTION_LEGEND_KEY : edgeLabelKeyFor(hover.edge.linkType))}</div>
            <div style={{ fontSize: 10.5, color: "#9393b5", marginTop: 2, lineHeight: 1.4, whiteSpace: "normal" }}>{t(hover.edge.mention ? MENTION_DESCRIPTION_KEY : edgeDescriptionKeyFor(hover.edge.linkType))}</div>
          </div>
        )
      })()}
    </div>
  )
}
