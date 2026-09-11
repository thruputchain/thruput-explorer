"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DustStream } from "@/components/live/dust-stream";
import { useLiveStream, type LiveConnection } from "@/components/live/use-live-stream";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAge, formatInteger, formatRate, formatSeconds, shortenHex } from "@/lib/groundhog/live/format";
import { AVERAGE_BLOCKS, RATE_WINDOW_MS, computeLiveStats } from "@/lib/groundhog/live/stats";
import { cn } from "@/lib/utils";

const TABLE_ROWS = 30;

export function LiveTransactions() {
  const stream = useLiveStream();
  const stats = useMemo(() => computeLiveStats(stream.blocks), [stream.blocks]);
  const now = useNow(1_000);
  const [showTable, setShowTable] = useState(false);

  const status = stream.status;
  const behindBlocks = status?.indexerHeight && status.settledHeight ? BigInt(status.indexerHeight) - BigInt(status.settledHeight) : null;
  const behindMs = behindBlocks !== null && stats.blockIntervalMs !== null ? Number(behindBlocks) * stats.blockIntervalMs : null;
  const contracts = stream.hello?.contracts ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-6xl font-medium tracking-tight tabular-nums sm:text-7xl" aria-live="off">
            {stats.ratePerSecond === null ? <span className="text-muted-foreground">&mdash;</span> : formatRate(stats.ratePerSecond)}
          </p>
          <p className="text-muted-foreground">
            {stats.ratePerSecond === null
              ? "transactions per second, waiting for two settled blocks with timestamps"
              : `transactions per second over the last ${formatSeconds(Math.min(stats.rateSeconds * 1_000, RATE_WINDOW_MS))} of settled blocks`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3 lg:text-right">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Latest settled block</dt>
            <dd className="font-mono tabular-nums">{stats.newest ? formatInteger(stats.newest.height) : "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Average per block</dt>
            <dd className="font-mono tabular-nums">
              {stats.averagePerBlock === null ? "—" : formatRate(stats.averagePerBlock)}
              {stats.averageBlocks > 0 ? <span className="ml-1 font-sans text-muted-foreground">over {stats.averageBlocks === AVERAGE_BLOCKS ? "" : "the last "}{stats.averageBlocks} blocks</span> : null}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Since you opened this page</dt>
            <dd className="font-mono tabular-nums">
              {formatInteger(stream.session.txCount)}
              <span className="ml-1 font-sans text-muted-foreground">
                {stream.session.txCount === 1 ? "transaction" : "transactions"} in {formatInteger(stream.session.blockCount)} {stream.session.blockCount === 1 ? "block" : "blocks"}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <StatusLine connection={stream.connection} state={status?.state} error={status?.error} behindBlocks={behindBlocks} behindMs={behindMs} />
          <Button variant="outline" size="sm" aria-expanded={showTable} aria-controls="live-block-table" onClick={() => setShowTable((value) => !value)}>
            {showTable ? "Hide table" : "Show table"}
          </Button>
        </div>
        <DustStream blocks={stream.blocks} blockIntervalMs={stats.blockIntervalMs} className="h-64 sm:h-80 lg:h-96" />
      </section>

      {showTable ? (
        <section id="live-block-table" className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Block</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">HOG moved</TableHead>
                <TableHead>Settled</TableHead>
                <TableHead>Example transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stream.blocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No settled blocks yet.</TableCell>
                </TableRow>
              ) : (
                [...stream.blocks].reverse().slice(0, TABLE_ROWS).map((block) => (
                  <TableRow key={block.height}>
                    <TableCell className="font-mono tabular-nums">{formatInteger(block.height)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatInteger(block.txCount)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{block.hogMoved}</TableCell>
                    <TableCell className="text-muted-foreground">{formatAge(block.observedAt, now)}</TableCell>
                    <TableCell>
                      {block.sampleTxHash ? (
                        <Link className="font-mono underline underline-offset-4" href={`/tx/${block.sampleTxHash}`} title={block.sampleTxHash}>
                          {shortenHex(block.sampleTxHash)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">none</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <p className="max-w-3xl text-sm text-muted-foreground">
        A transaction is counted once per block when it emits an event on{" "}
        {contracts.length === 0 ? "the watched contracts" : contracts.length === 1 ? "the native HOG contract" : `${contracts.length} watched contracts`}
        {stream.hello ? <>, read from <span className="font-mono">{stream.hello.rpcUrl}</span></> : null}
        . Transactions that touch none of them are not shown.
      </p>
    </div>
  );
}

function StatusLine({
  connection,
  state,
  error,
  behindBlocks,
  behindMs,
}: {
  connection: LiveConnection;
  state?: "starting" | "live" | "degraded";
  error?: string;
  behindBlocks: bigint | null;
  behindMs: number | null;
}) {
  let tone = "bg-muted-foreground";
  let text = "Connecting to the stream";
  if (connection === "closed") {
    tone = "bg-destructive";
    text = "The stream was closed. Reload the page to reconnect";
  } else if (connection === "reconnecting") {
    text = "Reconnecting to the stream";
  } else if (connection === "open" && state === "degraded") {
    tone = "bg-destructive";
    text = error ? `Stream degraded: ${error}` : "Stream degraded";
  } else if (connection === "open" && state === "live") {
    tone = "bg-primary";
    text = behindBlocks === null
      ? "Live"
      : `Live, ${formatInteger(behindBlocks)} ${behindBlocks === 1n ? "block" : "blocks"} behind the indexer tip${behindMs !== null ? ` (about ${formatSeconds(behindMs)})` : ""}`;
  } else if (connection === "open") {
    text = "Waiting for the first settled block";
  }
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <span aria-hidden="true" className={cn("inline-block size-2 rounded-full", tone)} />
      <span>{text}</span>
    </p>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
