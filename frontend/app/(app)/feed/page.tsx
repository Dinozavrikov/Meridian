"use client"
import { Header } from "@/components/layout/header"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { GraphTeaser } from "@/components/feed/graph-teaser"
import { RecentlyConfirmed } from "@/components/feed/recently-confirmed"
import { FeedGroupsView } from "@/components/feed/feed-groups-view"
import { PUBLIC_SCOPE } from "@/lib/feed-scope"

export default function FeedPage() {
  return (
    <PageShell>
      <Header titleKey="page.feed.title" />
      {/* visible: у PageContent по умолчанию своя прокрутка, и sticky правой панели прилипал бы к нему, а не к окну */}
      <PageContent overflow="visible">
        <div style={{ maxWidth: 1080, margin: "0 auto", width: "100%" }}>
          <FeedGroupsView key="public" scope={PUBLIC_SCOPE} layout="split" showHeading
            extras={<><RecentlyConfirmed /><GraphTeaser /></>} />
        </div>
      </PageContent>
    </PageShell>
  )
}
