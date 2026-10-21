import { Suspense } from "react";

import { SearchHero } from "@/components/search-hero";
import { RecentActivityBlocks, RecentActivityTransactions, RecentActivityFallback } from "@/components/recent-activity";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="app-container flex-1 py-10 sm:py-14">
      <SearchHero />
      <div className="mt-10 grid items-stretch gap-6 sm:mt-12 lg:grid-cols-2">
        <Suspense fallback={<RecentActivityFallback title="Recent blocks" />}>
          <RecentActivityBlocks />
        </Suspense>
        <Suspense fallback={<RecentActivityFallback title="Recent transactions" />}>
          <RecentActivityTransactions />
        </Suspense>
      </div>
    </main>
  );
}
