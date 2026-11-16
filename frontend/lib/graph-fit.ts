// Подгонка зума так, чтобы весь граф поместился на экране.
export interface FitTransform { k: number; x: number; y: number }

export function fitTransform(
  points: { x: number; y: number }[], W: number, H: number,
  pad = 48, minK = 0.05, maxK = 1.5,
): FitTransform | null {
  const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (pts.length === 0 || W <= 0 || H <= 0) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1)
  const k = Math.min(maxK, Math.max(minK, Math.min((W - 2 * pad) / w, (H - 2 * pad) / h)))
  return { k, x: W / 2 - (k * (minX + maxX)) / 2, y: H / 2 - (k * (minY + maxY)) / 2 }
}
