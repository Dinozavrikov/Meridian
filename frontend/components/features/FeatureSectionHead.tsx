import { v2 } from "@/lib/theme"

export function FeatureSectionHead({ title, lead }: { title: string; lead: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: v2.t1 }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: v2.t3, maxWidth: 720 }}>{lead}</p>
    </div>
  )
}
