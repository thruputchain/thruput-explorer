import { Suspense } from "react";

import { SearchHero } from "@/components/search-hero";
import { LatestHogTransfersCard, LatestHogTransfersFallback } from "@/components/latest-hog-transfers-card";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="app-container flex-1 py-10 sm:py-14">
      <SearchHero />
      <Suspense fallback={<LatestHogTransfersFallback />}>
        <LatestHogTransfersCard />
      </Suspense>
    </main>
  );
}
