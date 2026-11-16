export type FeedScope = { type: "public" } | { type: "lab"; labId: number; labName: string }

export const PUBLIC_SCOPE: FeedScope = { type: "public" }

export function scopeKey(scope: FeedScope): string {
  return scope.type === "public" ? "public" : `lab-${scope.labId}`
}
