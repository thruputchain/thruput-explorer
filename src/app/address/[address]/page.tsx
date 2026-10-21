import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { BlockLink } from "@/components/block-link";
import { FieldRow } from "@/components/transaction/field-row";
import { shortenIdentifier } from "@/lib/format";
import { TransactionActivityRow } from "@/components/transaction-activity-row";
import { loadTransactionActivity } from "@/lib/thruput/transaction-activity";

import { PageHeader } from "@/components/page-header";
import { RpcAlert } from "@/components/rpc-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  return (
    <main className="min-w-0 flex-1">
      <PageHeader
        title={data.status === "ok" && data.label ? data.label : "Address"}
        value={data.address}
        badges={data.status === "ok" ? data.badges : []}
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
            {data.metadata ? (
              <ContractEventsCard
                events={data.contractEvents}
                error={data.contractEventsError}
                token
              />
            ) : (
              <>
                <AddressActivityTabs data={data} />
                {data.contractEvents.length > 0 || data.contractEventsError ? (
                  <ContractEventsCard
                    events={data.contractEvents}
                    error={data.contractEventsError}
                    token={false}
                  />
                ) : null}
              </>
            )}
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
    <Tabs defaultValue="transactions" className="w-full">
      <TabsList variant="line" aria-label="Address activity">
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="transfers">Token Transfers</TabsTrigger>
      </TabsList>
      <TabsContent value="transactions">
        <TransactionHistoryCard
          transactions={data.transactions}
          error={data.transactionsError}
          partial={data.transactionHistoryPartial}
        />
      </TabsContent>
      <TabsContent value="transfers">
        <HogTransfersCard
          events={data.hogTransfers}
          error={data.hogTransfersError}
        />
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
          <FieldRow label="Address"><span className="break-all">{data.address}</span></FieldRow>
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
              <FieldRow label="Token decimals">{data.metadata.decimals}</FieldRow>
            </>
          ) : null}
          <FieldRow label="RPC URL"><span className="break-all">{data.rpcUrl}</span></FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

async function TransactionHistoryCard({
  transactions,
  error,
  partial,
}: {
  transactions: AddressTransactionRefView[];
  error?: RpcFailure;
  partial: boolean;
}) {
  const activity = error ? [] : await loadTransactionActivity(transactions.map((transaction) => ({ hash: transaction.txHash, height: transaction.height })));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction History</CardTitle>
      </CardHeader>
      <CardContent>
        {partial && !error ? <p role="status" className="mb-4 text-sm text-muted-foreground">Some activity sources are unavailable.</p> : null}
        {error ? (
          <RpcAlert
            title="Transaction history unavailable"
            description="The rest of the address page can still render with partial data."
            error={error}
          />
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {partial ? "No transactions found in the available activity sources." : "No transactions found for this address."}
          </p>
        ) : (
          <ul className="divide-y">
            {activity.map((transaction) => <TransactionActivityRow key={transaction.hash} transaction={transaction} showIcon={false} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HogTransfersCard({
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

function ContractEventsCard({
  events,
  error,
  token,
}: {
  events: AddressEventView[];
  error?: RpcFailure;
  token: boolean;
}) {
  const visibleEvents = token ? events.filter(isTokenTransferEvent) : events;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {token ? "Token Transfer History" : "Contract Events"}
        </CardTitle>
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
            {token
              ? "Transfers, mints, and burns appear here when this token emits ERC20 Transfer events."
              : "Events appear here when this address is the emitting contract."}
          </p>
        ) : (
          <Table>
            {token ? (
              <TokenEventTable events={visibleEvents} />
            ) : (
              <RawEventTable events={visibleEvents} />
            )}
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

function RawEventTable({ events }: { events: AddressEventView[] }) {
  return (
    <>
      <TableHeader>
        <TableRow>
          <TableHead>Tx</TableHead>
          <TableHead>Block</TableHead>
          <TableHead>Topics</TableHead>
          <TableHead>Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <RawEventRow
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
      <TableCell><BlockLink height={event.blockHeight} /></TableCell>
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

function RawEventRow({ event }: { event: AddressEventView }) {
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
      <TableCell><BlockLink height={event.blockHeight} /></TableCell>
      <TableCell>
        <code title={event.topics.join(", ")}>
          {event.topics.length > 0
            ? event.topics.map(shortenIdentifier).join(", ")
            : "-"}
        </code>
      </TableCell>
      <TableCell>
        <code title={event.data}>
          {shortenIdentifier(event.data)}
        </code>
      </TableCell>
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
