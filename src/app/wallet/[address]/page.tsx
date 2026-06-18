import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadWalletPageData, type WalletTransferView } from "@/lib/groundhog/wallets";

export const dynamic = "force-dynamic";

export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const data = await loadWalletPageData(address);

  return (
    <main className="min-h-screen bg-background px-4 pt-4">
      <div className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase text-muted-foreground">Wallet</p>
            {data.status === "ok" ? <Badge variant="secondary">Known Tokens</Badge> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
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
            <AlertTitle>Invalid wallet address</AlertTitle>
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
            <WalletSummaryCard data={data} />
            <WalletTransfersCard transfers={data.transfers} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function WalletSummaryCard({ data }: { data: Extract<Awaited<ReturnType<typeof loadWalletPageData>>, { status: "ok" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Known-token transfer history for this wallet.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-[180px_1fr]">
        <SummaryLabel>Address</SummaryLabel>
        <code className="break-all text-xs">{data.address}</code>
        <SummaryLabel>Known tokens</SummaryLabel>
        <p>{data.tokenCount}</p>
        <SummaryLabel>Transfers shown</SummaryLabel>
        <p>{data.transfers.length}</p>
      </CardContent>
    </Card>
  );
}

function WalletTransfersCard({ transfers }: { transfers: WalletTransferView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Transfers</CardTitle>
        <CardDescription>
          {transfers.length === 0
            ? "No known-token transfers found for this wallet."
            : `${transfers.length} known-token transfer${transfers.length === 1 ? "" : "s"}. This is not complete wallet transaction history.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Transfers appear here when known token contracts emit ERC20 Transfer events for this wallet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tx</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <WalletTransferRow key={`${transfer.txHash}-${transfer.sequenceNumber}`} transfer={transfer} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function WalletTransferRow({ transfer }: { transfer: WalletTransferView }) {
  const amount = transfer.decoded ? `${transfer.decoded.amount}${transfer.decoded.symbol ? ` ${transfer.decoded.symbol}` : ""}` : "Raw event";

  return (
    <TableRow>
      <TableCell>
        <Link className="font-mono underline underline-offset-4" href={`/tx/${transfer.txHash}`} title={transfer.txHash}>
          {shortenHex(transfer.txHash)}
        </Link>
      </TableCell>
      <TableCell>{transfer.blockHeight}</TableCell>
      <TableCell className="capitalize">{transfer.direction}</TableCell>
      <TableCell>
        <Link className="underline underline-offset-4" href={`/contract/${transfer.tokenAddress}`} title={transfer.tokenAddress}>
          {transfer.tokenName ?? shortenHex(transfer.tokenAddress)}
        </Link>
      </TableCell>
      <TableCell>
        <AddressLink value={transfer.decoded?.from} />
      </TableCell>
      <TableCell>
        <AddressLink value={transfer.decoded?.to} />
      </TableCell>
      <TableCell className="text-right">{amount}</TableCell>
    </TableRow>
  );
}

function AddressLink({ value }: { value?: string }) {
  return value ? (
    <Link className="font-mono underline underline-offset-4" href={`/wallet/${value}`} title={value}>
      {shortenHex(value)}
    </Link>
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
