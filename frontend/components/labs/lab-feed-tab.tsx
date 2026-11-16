"use client"
import { FeedGroupsView } from "@/components/feed/feed-groups-view"

export function LabFeedTab({ labId, labName }: { labId: number; labName: string }) {
  return (
    <div className="p-5">
      <FeedGroupsView key={labId} scope={{ type: "lab", labId, labName }} layout="single" />
    </div>
  )
}
