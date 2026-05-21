import { AlertCircleIcon } from "lucide-react";

import { TransactionEventsCard } from "@/components/transaction/transaction-events-card";
import { TransactionExecutionCard } from "@/components/transaction/transaction-execution-card";
import { TransactionHeader } from "@/components/transaction/transaction-header";
import { TransactionSummaryCard } from "@/components/transaction/transaction-summary-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadTransactionPageData } from "@/lib/groundhog/transactions";

export const dynamic = "force-dynamic";

export default async function TransactionPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const data = await loadTransactionPageData(hash);

  return (
    <main className="min-h-screen bg-background">
      <TransactionHeader data={data} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:px-8">
        {data.status.kind === "unavailable" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Groundhog RPC unavailable</AlertTitle>
            <AlertDescription>{data.status.error.message}</AlertDescription>
          </Alert>
        ) : null}

        {data.status.kind === "unknown" ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>Unknown transaction</AlertTitle>
            <AlertDescription>The node does not know this transaction hash yet.</AlertDescription>
          </Alert>
        ) : null}

        <TransactionSummaryCard data={data} />
        <TransactionExecutionCard data={data} />
        <TransactionEventsCard events={data.receipt.events} />
      </div>
    </main>
  );
}
