import { AlertCircleIcon } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";
import { BlockLink } from "@/components/block-link";
import { FieldRow } from "@/components/transaction/field-row";
import { shortenIdentifier } from "@/lib/format";
import { TransactionActivityRow } from "@/components/transaction-activity-row";
import { loadTransactionActivity } from "@/lib/thruput/transaction-activity";

import { PageHeader } from "@/components/page-header";
import { ContractSpecCard } from "@/components/contract-spec-card";
import { ContractEventsTable } from "@/components/contract-events-table";
import { RpcAlert } from "@/components/rpc-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  loadAddressPageData,
  type AddressEventView,
  type AddressTransactionRefView,
} from "@/lib/thruput/addresses";
import type { RpcFailure } from "@/lib/thruput/types";

export const dynamic = "force-dynamic";

export default async function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const data = await loadAddressPageData(address);
  const contract =
    data.status === "ok" && data.contractSpec.status === "available"
      ? data.contractSpec
      : undefined;
  const badges =
    data.status === "ok"
      ? data.badges.filter((badge) => !contract || badge !== "Address")
      : [];
  if (contract?.wallet) {
    if (!badges.includes("Wallet")) badges.push("Wallet");
  } else if (contract && !badges.includes("Contract")) badges.push("Contract");
  if (contract?.selectionSource === "networkDefault") badges.push("Network default");

  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title={
          data.status === "ok" && data.label
            ? data.label
            : (contract?.name ?? (contract ? "Contract" : "Address"))
        }
        value={data.address}
        badges={badges}
        copyLabel="Copy address"
      />

      <div className="app-container flex flex-col gap-6 py-8">
        {data.status === "malformed" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Invalid address</AlertTitle>
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "unavailable" ? (
          <RpcAlert
            title="Thruput RPC unavailable"
            description="The address page could not load from the configured RPC endpoint."
            error={data.error}
          />
        ) : null}

        {data.status === "ok" ? (
          <>
            <AddressSummaryCard data={data} />
            <AddressActivityTabs data={data} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function AddressActivityTabs({
  data,
}: {
  data: Extract<
    Awaited<ReturnType<typeof loadAddressPageData>>,
    { status: "ok" }
  >;
}) {
  return (
    <Tabs defaultValue="transactions" className="min-w-0 w-full">
      <div className="max-w-full overflow-x-auto overflow-y-hidden">
        <TabsList variant="line" aria-label="Address activity">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="transfers">Token Transfers</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="spec">Contract spec</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="transactions">
        <TransactionHistoryCard
          transactions={data.transactions}
          error={data.transactionsError}
          partial={data.transactionHistoryPartial}
        />
      </TabsContent>
      <TabsContent value="transfers">
        {data.metadata ? (
          <TokenContractTransfersCard
            events={data.contractEvents}
            error={data.contractEventsError}
          />
        ) : (
          <NativeTokenTransfersCard
            events={data.nativeTokenTransfers}
            error={data.nativeTokenTransfersError}
          />
        )}
      </TabsContent>
      <TabsContent value="events">
        <ContractEventsTable
          events={data.contractEvents}
          error={data.contractEventsError}
          previews={
            data.contractSpec.status === "available"
              ? data.contractSpec.eventPreviews
              : []
          }
        />
      </TabsContent>
      <TabsContent value="spec">
        <ContractSpecCard data={data.contractSpec} />
      </TabsContent>
    </Tabs>
  );
}

function AddressSummaryCard({
  data,
}: {
  data: Extract<
    Awaited<ReturnType<typeof loadAddressPageData>>,
    { status: "ok" }
  >;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow label="Address">
            <span className="break-all">{data.address}</span>
          </FieldRow>
          <FieldRow label="Native balance">
            {data.nativeBalance
              ? `${data.nativeBalance.amount} ${data.nativeBalance.symbol}`
              : "Not available"}
          </FieldRow>
          <FieldRow label="Raw native balance">
            {data.nativeBalance?.rawBalance ?? "Not available"}
          </FieldRow>
          {data.metadata ? (
            <>
              <FieldRow label="Token name">{data.metadata.name}</FieldRow>
              <FieldRow label="Token symbol">{data.metadata.symbol}</FieldRow>
              <FieldRow label="Token decimals">
                {data.metadata.decimals}
              </FieldRow>
            </>
          ) : null}
          <FieldRow label="RPC URL">
            <span className="break-all">{data.rpcUrl}</span>
          </FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function TransactionHistoryCard({
  transactions,
  error,
  partial,
}: {
  transactions: AddressTransactionRefView[];
  error?: RpcFailure;
  partial: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction History</CardTitle>
      </CardHeader>
      <CardContent>
        {partial && !error ? (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            Some activity sources are unavailable.
          </p>
        ) : null}
        {error ? (
          <RpcAlert
            title="Transaction history unavailable"
            description="The rest of the address page can still render with partial data."
            error={error}
          />
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {partial
              ? "No transactions found in the available activity sources."
              : "No transactions found for this address."}
          </p>
        ) : (
          <Suspense
            fallback={
              <TransactionHistoryFallback transactions={transactions} />
            }
          >
            <TransactionHistoryList transactions={transactions} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}

async function TransactionHistoryList({
  transactions,
}: {
  transactions: AddressTransactionRefView[];
}) {
  const activity = await loadTransactionActivity(
    transactions.map((transaction) => ({
      hash: transaction.txHash,
      height: transaction.height,
    })),
  );
  return (
    <ul className="divide-y">
      {activity.map((transaction) => (
        <TransactionActivityRow
          key={transaction.hash}
          transaction={transaction}
          showIcon={false}
        />
      ))}
    </ul>
  );
}

function TransactionHistoryFallback({
  transactions,
}: {
  transactions: AddressTransactionRefView[];
}) {
  return (
    <ul
      className="divide-y"
      aria-busy="true"
      aria-label="Loading transaction details"
    >
      {transactions.map((transaction) => (
        <li
          key={transaction.txHash}
          className="app-activity-row flex items-center justify-between gap-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/tx/${transaction.txHash}`}
              title={transaction.txHash}
              className="truncate font-mono text-sm font-medium hover:underline hover:underline-offset-4"
            >
              {shortenIdentifier(transaction.txHash)}
            </Link>
            <span className="text-xs leading-5 text-muted-foreground">
              Loading details…
            </span>
          </div>
          <Link
            href={`/block/${transaction.height}`}
            className="text-xs hover:underline hover:underline-offset-4"
          >
            Block <span className="font-mono">{transaction.height}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NativeTokenTransfersCard({
  events,
  error,
}: {
  events: AddressEventView[];
  error?: RpcFailure;
}) {
  const transfers = events.filter(isTokenTransferEvent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Transfers</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <RpcAlert
            title="Token transfers unavailable"
            description="The rest of the address page can still render with partial data."
            error={error}
          />
        ) : transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Recent sent and received token transfers will appear here.
          </p>
        ) : (
          <Table>
            <TokenEventTable events={transfers} />
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TokenContractTransfersCard({
  events,
  error,
}: {
  events: AddressEventView[];
  error?: RpcFailure;
}) {
  const visibleEvents = events.filter(isTokenTransferEvent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Transfer History</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <RpcAlert
            title="Event history unavailable"
            description="Raw events will appear here when the RPC returns emitted events for this address."
            error={error}
          />
        ) : visibleEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Transfers, mints, and burns appear here when this token emits ERC20
            Transfer events.
          </p>
        ) : (
          <Table>
            <TokenEventTable events={visibleEvents} />
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TokenEventTable({ events }: { events: AddressEventView[] }) {
  return (
    <>
      <TableHeader>
        <TableRow>
          <TableHead>Transaction</TableHead>
          <TableHead>Block</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TokenEventRow
            key={`${event.txHash}-${event.sequenceNumber}`}
            event={event}
          />
        ))}
      </TableBody>
    </>
  );
}

function TokenEventRow({ event }: { event: AddressEventView }) {
  const decoded = isTokenTransferEvent(event) ? event.decoded : undefined;
  const amount = decoded
    ? `${decoded.amount}${decoded.symbol ? ` ${decoded.symbol}` : ""}`
    : "-";

  return (
    <TableRow>
      <TableCell>
        <Link
          className="font-mono underline-offset-4 hover:underline"
          href={`/tx/${event.txHash}`}
          title={event.txHash}
        >
          {shortenIdentifier(event.txHash)}
        </Link>
      </TableCell>
      <TableCell>
        <BlockLink height={event.blockHeight} />
      </TableCell>
      <TableCell>
        <AddressLink value={decoded?.from} />
      </TableCell>
      <TableCell>
        <AddressLink value={decoded?.to} />
      </TableCell>
      <TableCell className="text-right">{amount}</TableCell>
    </TableRow>
  );
}

function AddressLink({ value }: { value?: string }) {
  return value ? (
    <Link
      className="font-mono underline-offset-4 hover:underline"
      href={`/address/${value}`}
      title={value}
    >
      {shortenIdentifier(value)}
    </Link>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

function isTokenTransferEvent(
  event: AddressEventView,
): event is AddressEventView & {
  decoded: NonNullable<AddressEventView["decoded"]>;
} {
  return (
    event.decoded?.kind === "token-transfer" ||
    event.decoded?.kind === "token-mint" ||
    event.decoded?.kind === "token-burn"
  );
}
