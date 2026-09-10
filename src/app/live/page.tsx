import type { Metadata } from "next";

import { LiveTransactions } from "@/components/live/live-transactions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live transactions - Thruput Explorer",
  description: "Watch settled Thruput blocks fill with transactions as the chain processes them.",
};

export default function LivePage() {
  return (
    <main className="app-container flex-1 py-8 sm:py-10">
      <LiveTransactions />
    </main>
  );
}
