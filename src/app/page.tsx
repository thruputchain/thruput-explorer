import { Suspense } from "react";

import { SearchHero } from "@/components/search-hero";
import { LatestHogTransfersCard, LatestHogTransfersFallback } from "@/components/latest-hog-transfers-card";
import { RecentBlocks } from "@/components/recent-blocks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="app-container flex-1 py-10 sm:py-14">
      <SearchHero />
      <Tabs defaultValue="blocks" className="mt-10 sm:mt-12">
        <TabsList aria-label="Recent activity" className="w-full sm:w-fit">
          <TabsTrigger value="blocks" className="min-w-0 whitespace-normal">Recent blocks</TabsTrigger>
          <TabsTrigger value="transfers" className="min-w-0 whitespace-normal">Recent HOG transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="blocks">
          <Suspense fallback={<p role="status" aria-busy="true">Loading recent blocks...</p>}>
            <RecentBlocks />
          </Suspense>
        </TabsContent>
        <TabsContent value="transfers">
          <Suspense fallback={<LatestHogTransfersFallback />}>
            <LatestHogTransfersCard />
          </Suspense>
        </TabsContent>
      </Tabs>
    </main>
  );
}
