import { Suspense } from "react";

import { SearchHero } from "@/components/search-hero";
import { AppHeader } from "@/components/app-header";
import { LatestHogTransfersCard, LatestHogTransfersFallback } from "@/components/latest-hog-transfers-card";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-background mx-auto w-full max-w-5xl px-4">
      <AppHeader />
      <SearchHero />
      <Suspense fallback={<LatestHogTransfersFallback />}>
        <LatestHogTransfersCard />
      </Suspense>
    </main>
  );
}
