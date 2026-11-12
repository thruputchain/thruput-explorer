import { Suspense } from "react";

import { AlertCircleIcon } from "lucide-react";

import { RpcAlert } from "@/components/rpc-alert";
import { TransactionEventsCard } from "@/components/transaction/transaction-events-card";
import { TransactionHeader } from "@/components/transaction/transaction-header";
import { TransactionInputCard } from "@/components/transaction/transaction-input-card";
import { TransactionTechnicalCard } from "@/components/transaction/transaction-technical-card";
import { TransactionSummaryCard } from "@/components/transaction/transaction-summary-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadTransactionPageData, type LoadedTransactionPage } from "@/lib/thruput/transactions";

export const dynamic = "force-dynamic";

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const data = await loadTransactionPageData(hash);

  return (
    <main className="min-w-0 flex-1">
      <TransactionHeader data={data} />
      <div className="app-container flex flex-col gap-6 py-8">
        {data.status.status === "unavailable" ? (
          <RpcAlert title="Thruput RPC unavailable" description="The transaction page could not load from the configured RPC endpoint." error={data.status.error} />
        ) : null}

        {data.status.status === "unknown" ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>Unknown transaction</AlertTitle>
            <AlertDescription>
              No status is available from this lookup. Retained input or receipts may provide separate evidence.
            </AlertDescription>
          </Alert>
        ) : null}

        <Suspense fallback={<p role="status">Loading transaction input…</p>}>
          <TransactionInputCard data={data} />
        </Suspense>
        <TransactionSummaryCard data={data} />
        <Suspense fallback={<TransactionEventsCard events={data.receipt?.events ?? []} />}>
          <EnrichedTransactionEvents data={data} />
        </Suspense>
        <TransactionTechnicalCard data={data} />
      </div>
    </main>
  );
}

async function EnrichedTransactionEvents({ data }: { data: LoadedTransactionPage }) {
  const events = data.loadEnrichedEvents
    ? await data.loadEnrichedEvents()
    : data.receipt?.events ?? [];
  return <TransactionEventsCard events={events} />;
}
