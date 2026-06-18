import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadContractPageData, type ContractEventView } from "@/lib/groundhog/contracts";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const data = await loadContractPageData(address);

  return (
    <main className="min-h-screen bg-background px-4 pt-4">
      <div className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase text-muted-foreground">Contract</p>
            {data.status === "ok" && data.token ? <Badge variant="secondary">Token</Badge> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{data.status === "ok" && data.label ? data.label : "Contract"}</h1>
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
            <AlertTitle>Invalid contract address</AlertTitle>
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "unavailable" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Groundhog RPC unavailable</AlertTitle>
            <AlertDescription>{data.error.message}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "ok" ? (
          <>
            <ContractSummaryCard data={data} />
            <ContractEventsCard events={data.events} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function ContractSummaryCard({ data }: { data: Extract<Awaited<ReturnType<typeof loadContractPageData>>, { status: "ok" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Current public RPC view of this contract.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-[180px_1fr]">
        <SummaryLabel>Address</SummaryLabel>
        <code className="break-all text-xs">{data.address}</code>
        <SummaryLabel>Name</SummaryLabel>
        <p>{data.metadata?.name ?? "Not available"}</p>
        <SummaryLabel>Symbol</SummaryLabel>
        <p>{data.metadata?.symbol ?? "Not available"}</p>
        <SummaryLabel>Decimals</SummaryLabel>
        <p>{data.metadata?.decimals ?? "Not available"}</p>
      </CardContent>
    </Card>
  );
}

function ContractEventsCard({ events }: { events: ContractEventView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Events</CardTitle>
        <CardDescription>
          {events.length === 0
            ? "No events found for this contract."
            : `${events.length} recent event${events.length === 1 ? "" : "s"}. Eventless calls and deployments are not included.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Events will appear here when the contract emits them.</p>
        ) : (
          <Table>
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
                <ContractEventRow key={`${event.txHash}-${event.sequenceNumber}`} event={event} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ContractEventRow({ event }: { event: ContractEventView }) {
  const amount = event.decoded ? `${event.decoded.amount}${event.decoded.symbol ? ` ${event.decoded.symbol}` : ""}` : "Raw event";

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
        <AddressValue value={event.decoded?.from} />
      </TableCell>
      <TableCell>
        <AddressValue value={event.decoded?.to} />
      </TableCell>
      <TableCell className="text-right">{amount}</TableCell>
    </TableRow>
  );
}

function AddressValue({ value }: { value?: string }) {
  return value ? (
    <code title={value}>{shortenHex(value)}</code>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

function shortenHex(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function SummaryLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs uppercase text-muted-foreground">{children}</p>;
}
