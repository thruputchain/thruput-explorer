import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAddressPageData, type AddressEventView, type AddressTransactionRefView } from "@/lib/groundhog/addresses";
import type { DecodedEventView } from "@/lib/groundhog/types";

type TokenDecodedEventView = Exclude<DecodedEventView, { kind: "contract-event" }>;

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
      <div className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase text-muted-foreground">Address</p>
            {data.status === "ok" ? data.badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{data.status === "ok" && data.label ? data.label : "Address"}</h1>
              <code className="break-all text-sm text-muted-foreground">{data.address}</code>
            </div>
            <CopyButton value={data.address} />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
        {data.status === "malformed" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Invalid address</AlertTitle>
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "ok" ? (
          <>
            <AddressSummaryCard data={data} />
            <RootTransactionsCard transactions={data.rootTransactions} unavailable={data.rootTransactionsUnavailable} />
            <ContractEventsCard events={data.contractEvents} unavailable={data.contractEventsUnavailable} token={Boolean(data.metadata)} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function AddressSummaryCard({ data }: { data: Extract<Awaited<ReturnType<typeof loadAddressPageData>>, { status: "ok" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Current public RPC view of this Groundhog address.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-[180px_1fr]">
        <SummaryLabel>Address</SummaryLabel>
        <code className="break-all text-xs">{data.address}</code>
        <SummaryLabel>Native balance</SummaryLabel>
        <p>{data.nativeBalance ? `${data.nativeBalance.amount} ${data.nativeBalance.symbol}` : "Not available"}</p>
        <SummaryLabel>Raw native balance</SummaryLabel>
        <code className="break-all text-xs">{data.nativeBalance?.rawBalance ?? "Not available"}</code>
        <SummaryLabel>Context</SummaryLabel>
        <div className="flex flex-wrap gap-2">{data.badges.map((badge) => <Badge key={badge} variant="outline">{badge}</Badge>)}</div>
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

function RootTransactionsCard({ transactions, unavailable }: { transactions: AddressTransactionRefView[]; unavailable: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction History</CardTitle>
        <CardDescription>
          {unavailable
            ? "This RPC does not currently provide address transaction history."
            : transactions.length === 0
              ? "No transactions found for this address."
              : `${transactions.length} recent transaction${transactions.length === 1 ? "" : "s"} for this address.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Transactions will appear here when the RPC has indexed activity for this address.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tx</TableHead>
                <TableHead>Block</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.txHash}>
                  <TableCell>
                    <Link className="font-mono underline underline-offset-4" href={`/tx/${transaction.txHash}`} title={transaction.txHash}>
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

function ContractEventsCard({ events, unavailable, token }: { events: AddressEventView[]; unavailable: boolean; token: boolean }) {
  const visibleEvents = token ? events.filter(isTokenTransferEvent) : events;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{token ? "Token Transfer History" : "Contract Events"}</CardTitle>
        <CardDescription>
          {unavailable
            ? "This RPC does not currently provide event history for this address."
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
        {visibleEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {token ? "Transfers, mints, and burns appear here when this token emits ERC20 Transfer events." : "Events appear here when this address is the emitting contract."}
          </p>
        ) : (
          <Table>
            {token ? <TokenEventTable events={visibleEvents} /> : <GenericEventTable events={visibleEvents} />}
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
          <TableHead>Tx</TableHead>
          <TableHead>Block</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TokenEventRow key={`${event.txHash}-${event.sequenceNumber}`} event={event} />
        ))}
      </TableBody>
    </>
  );
}

function GenericEventTable({ events }: { events: AddressEventView[] }) {
  return (
    <>
      <TableHeader>
        <TableRow>
          <TableHead>Tx</TableHead>
          <TableHead>Block</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Fields</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <ContractEventRow key={`${event.txHash}-${event.sequenceNumber}`} event={event} />
        ))}
      </TableBody>
    </>
  );
}

function TokenEventRow({ event }: { event: AddressEventView }) {
  const decoded = isTokenTransferEvent(event) ? event.decoded : undefined;
  const amount = decoded ? `${decoded.amount}${decoded.symbol ? ` ${decoded.symbol}` : ""}` : "-";

  return (
    <TableRow>
      <TableCell>
        <Link className="font-mono underline underline-offset-4" href={`/tx/${event.txHash}`} title={event.txHash}>
          {shortenHex(event.txHash)}
        </Link>
      </TableCell>
      <TableCell>{event.blockHeight}</TableCell>
      <TableCell>{event.decoded?.name ?? "Raw"}</TableCell>
      <TableCell><AddressLink value={decoded?.from} /></TableCell>
      <TableCell><AddressLink value={decoded?.to} /></TableCell>
      <TableCell className="text-right">{amount}</TableCell>
    </TableRow>
  );
}

function ContractEventRow({ event }: { event: AddressEventView }) {
  const decoded = event.decoded?.kind === "contract-event" ? event.decoded : undefined;
  const fields = decoded ? [...decoded.topics, ...decoded.fields] : [];

  return (
    <TableRow>
      <TableCell>
        <Link className="font-mono underline underline-offset-4" href={`/tx/${event.txHash}`} title={event.txHash}>
          {shortenHex(event.txHash)}
        </Link>
      </TableCell>
      <TableCell>{event.blockHeight}</TableCell>
      <TableCell>{event.decoded?.name ?? "Raw"}</TableCell>
      <TableCell>
        {fields.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {fields.map((field) => (
              <span key={`${field.name}-${field.value}`}>
                <span className="text-muted-foreground">{field.name}=</span>
                <DecodedFieldValue value={field.value} />
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">Raw event</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function AddressLink({ value }: { value?: string }) {
  return value ? (
    <Link className="font-mono underline underline-offset-4" href={`/address/${value}`} title={value}>
      {shortenHex(value)}
    </Link>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

function DecodedFieldValue({ value }: { value: string }) {
  return isGroundhogAddress(value) ? <AddressLink value={value} /> : <span>{value}</span>;
}

function isTokenTransferEvent(event: AddressEventView): event is AddressEventView & { decoded: TokenDecodedEventView } {
  return event.decoded?.kind === "token-transfer" || event.decoded?.kind === "token-mint" || event.decoded?.kind === "token-burn";
}

function isGroundhogAddress(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function SummaryLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs uppercase text-muted-foreground">{children}</p>;
}

function shortenHex(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}
