import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { RpcAlert } from "@/components/rpc-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
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
} from "@/lib/groundhog/addresses";
import type { RpcFailure } from "@/lib/groundhog/types";

export const dynamic = "force-dynamic";

export default async function AddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const data = await loadAddressPageData(address);

  return (
    <main className="min-h-screen bg-background px-4 pt-4">
      <PageHeader
        eyebrow="Address"
        title={data.status === "ok" && data.label ? data.label : "Address"}
        value={data.address}
        badges={data.status === "ok" ? data.badges : []}
        copyLabel="Copy address"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
        {data.status === "malformed" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Invalid address</AlertTitle>
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "unavailable" ? (
          <RpcAlert
            title="Groundhog RPC unavailable"
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
      <TabsList variant="line">
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="transfers">HOG Transfers</TabsTrigger>
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
        <CardDescription>
          Current public RPC view of this Groundhog address.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-[180px_1fr]">
        <SummaryLabel>Address</SummaryLabel>
        <code className="break-all text-xs">{data.address}</code>
        <SummaryLabel>Native balance</SummaryLabel>
        <p>
          {data.nativeBalance
            ? `${data.nativeBalance.amount} ${data.nativeBalance.symbol}`
            : "Not available"}
        </p>
        <SummaryLabel>Raw native balance</SummaryLabel>
        <code className="break-all text-xs">
          {data.nativeBalance?.rawBalance ?? "Not available"}
        </code>
        {data.metadata ? (
          <>
            <SummaryLabel>Token name</SummaryLabel>
            <p>{data.metadata.name}</p>
            <SummaryLabel>Token symbol</SummaryLabel>
            <p>{data.metadata.symbol}</p>
            <SummaryLabel>Token decimals</SummaryLabel>
            <p>{data.metadata.decimals}</p>
          </>
        ) : null}
        <SummaryLabel>RPC URL</SummaryLabel>
        <span className="break-all font-mono text-xs">{data.rpcUrl}</span>
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
        <CardDescription>
          {error
            ? "This RPC could not provide address transaction history."
            : transactions.length === 0
              ? partial
                ? "No transactions found in the available activity sources. Some sources are unavailable."
                : "No transactions found for this address."
              : `${transactions.length} recent transaction${transactions.length === 1 ? "" : "s"} for this address.${partial ? " Some activity sources are unavailable." : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <RpcAlert
            title="Transaction history unavailable"
            description="The rest of the address page can still render with partial data."
            error={error}
          />
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Transactions will appear here when the RPC has indexed activity for
            this address.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Block</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.txHash}>
                  <TableCell>
                    <Link
                      className="font-mono underline underline-offset-4"
                      href={`/tx/${transaction.txHash}`}
                      title={transaction.txHash}
                    >
                      {shortenHex(transaction.txHash)}
                    </Link>
                  </TableCell>
                  <TableCell>{transaction.height}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        <CardTitle>HOG Transfers</CardTitle>
        <CardDescription>
          {error
            ? "This RPC could not provide HOG transfer history."
            : transfers.length === 0
              ? "No recent HOG transfers found for this address."
              : `${transfers.length} recent HOG transfer${transfers.length === 1 ? "" : "s"} involving this address.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <RpcAlert
            title="HOG transfers unavailable"
            description="The rest of the address page can still render with partial data."
            error={error}
          />
        ) : transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Recent sent and received HOG transfers will appear here.
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
        <CardDescription>
          {error
            ? "This RPC could not provide event history for this address."
            : visibleEvents.length === 0
              ? token
                ? "No ERC20 transfer events found for this token contract."
                : "No events found where this address emitted the event."
              : token
                ? `${visibleEvents.length} recent token transfer${visibleEvents.length === 1 ? "" : "s"} emitted by this token contract.`
                : `${visibleEvents.length} recent event${visibleEvents.length === 1 ? "" : "s"} emitted by this address.`}
        </CardDescription>
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
          className="font-mono underline underline-offset-4"
          href={`/tx/${event.txHash}`}
          title={event.txHash}
        >
          {shortenHex(event.txHash)}
        </Link>
      </TableCell>
      <TableCell>{event.blockHeight}</TableCell>
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
          className="font-mono underline underline-offset-4"
          href={`/tx/${event.txHash}`}
          title={event.txHash}
        >
          {shortenHex(event.txHash)}
        </Link>
      </TableCell>
      <TableCell>{event.blockHeight}</TableCell>
      <TableCell>
        <code className="font-mono text-xs" title={event.topics.join(", ")}>
          {event.topics.length > 0
            ? event.topics.map(shortenHex).join(", ")
            : "-"}
        </code>
      </TableCell>
      <TableCell>
        <code className="font-mono text-xs" title={event.data}>
          {shortenHex(event.data)}
        </code>
      </TableCell>
    </TableRow>
  );
}

function AddressLink({ value }: { value?: string }) {
  return value ? (
    <Link
      className="font-mono underline underline-offset-4"
      href={`/address/${value}`}
      title={value}
    >
      {shortenHex(value)}
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

function SummaryLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs uppercase text-muted-foreground">
      {children}
    </p>
  );
}

function shortenHex(value: string) {
  return value.length <= 18
    ? value
    : `${value.slice(0, 8)}...${value.slice(-6)}`;
}
