import Link from "next/link";
import { BlockLink } from "@/components/block-link";
import { shortenIdentifier } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadLatestNativeTokenTransfers } from "@/lib/thruput/latest-native-token-transfers";

export async function LatestNativeTokenTransfersCard() {
  const data = await loadLatestNativeTokenTransfers();

  return (
    <section className="w-full">
      <Card>
        <CardHeader>
          <CardTitle>Latest Token Transfers</CardTitle>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href={`/address/${data.nativeTokenAddress}`}>View all</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.status === "unavailable" ? (
            <p className="text-sm text-muted-foreground">Token transfer history is temporarily unavailable.</p>
          ) : data.transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent token transfers found.</p>
          ) : (
            <Table>
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
                {data.transfers.map((transfer) => (
                  <TableRow key={`${transfer.txHash}-${transfer.sequenceNumber}`}>
                    <TableCell>
                      <Link className="font-mono underline-offset-4 hover:underline" href={`/tx/${transfer.txHash}`} title={transfer.txHash}>
                        {shortenIdentifier(transfer.txHash)}
                      </Link>
                    </TableCell>
                    <TableCell><BlockLink height={transfer.blockHeight} /></TableCell>
                    <TableCell><AddressLink value={transfer.from} fallback={transfer.name} /></TableCell>
                    <TableCell><AddressLink value={transfer.to} fallback={transfer.name} /></TableCell>
                    <TableCell className="text-right">{transfer.amount} {transfer.symbol}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function LatestNativeTokenTransfersFallback() {
  return (
    <section className="w-full" aria-busy="true">
      <Card>
        <CardHeader>
          <CardTitle>Latest Token Transfers</CardTitle>
        </CardHeader>
        <CardContent><p role="status" className="text-sm text-muted-foreground">Loading recent transfers...</p></CardContent>
      </Card>
    </section>
  );
}

function AddressLink({ value, fallback }: { value?: string; fallback: string }) {
  return value ? (
    <Link className="font-mono underline-offset-4 hover:underline" href={`/address/${value}`} title={value}>
      {shortenIdentifier(value)}
    </Link>
  ) : (
    <span className="text-muted-foreground">{fallback}</span>
  );
}
