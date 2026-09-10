import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadLatestHogTransfers } from "@/lib/groundhog/latest-hog-transfers";

export async function LatestHogTransfersCard() {
  const data = await loadLatestHogTransfers();

  return (
    <section className="mt-10 w-full sm:mt-12">
      <Card>
        <CardHeader>
          <CardTitle>Latest HOG Transfers</CardTitle>
          <CardDescription>Recent transfers emitted by the native HOG contract.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href={`/address/${data.nativeTokenAddress}`}>View all</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.status === "unavailable" ? (
            <p className="text-sm text-muted-foreground">HOG transfer history is temporarily unavailable.</p>
          ) : data.transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent HOG transfers found.</p>
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
                      <Link className="font-mono underline underline-offset-4" href={`/tx/${transfer.txHash}`} title={transfer.txHash}>
                        {shortenHex(transfer.txHash)}
                      </Link>
                    </TableCell>
                    <TableCell>{transfer.blockHeight}</TableCell>
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

export function LatestHogTransfersFallback() {
  return (
    <section className="mt-10 w-full sm:mt-12" aria-busy="true">
      <Card>
        <CardHeader>
          <CardTitle>Latest HOG Transfers</CardTitle>
          <CardDescription>Loading recent transfers...</CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}

function AddressLink({ value, fallback }: { value?: string; fallback: string }) {
  return value ? (
    <Link className="font-mono underline underline-offset-4" href={`/address/${value}`} title={value}>
      {shortenHex(value)}
    </Link>
  ) : (
    <span className="text-muted-foreground">{fallback}</span>
  );
}

function shortenHex(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}
