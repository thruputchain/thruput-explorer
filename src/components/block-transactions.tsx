"use client";

import { ArrowLeftIcon, ArrowRightIcon, RefreshCwIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { nextBlockTransactions } from "@/app/block/[height]/actions";
import { TransactionActivityRow } from "@/components/transaction-activity-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockActivityPage } from "@/lib/thruput/block-activity";
import { checkBlockContinuation } from "@/lib/thruput/block-pagination";

export function BlockTransactions({
  height,
  initial,
  loadingDetails = false,
}: {
  height: string;
  initial: BlockActivityPage;
  loadingDetails?: boolean;
}) {
  const [pages, setPages] = useState([initial]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [invalidContinuation, setInvalidContinuation] = useState(false);
  const [pending, startTransition] = useTransition();
  const seen = useRef(new Set([initial.cursor]));
  const page = pages[index];
  const busy = pending || loadingDetails;

  function load(refresh = false) {
    if (!refresh && page.cursor === null) return;
    if (!refresh && index < pages.length - 1) {
      setIndex(index + 1);
      return;
    }
    startTransition(async () => {
      try {
        const result = await nextBlockTransactions(
          height,
          refresh ? undefined : page.cursor!,
        );
        if (result.status !== "ok") {
          setMessage(result.message);
          if (result.status === "invalid" || result.status === "missing")
            setInvalidContinuation(true);
          return;
        }
        if (
          !refresh &&
          !checkBlockContinuation(page, result.data, seen.current)
        ) {
          setMessage(
            "The transaction index changed. Refresh transactions to return to the first page.",
          );
          setInvalidContinuation(true);
          return;
        }
        setMessage("");
        if (refresh) {
          setInvalidContinuation(false);
          seen.current = new Set([result.data.cursor]);
          setPages([result.data]);
          setIndex(0);
        } else {
          seen.current.add(result.data.cursor);
          setPages([...pages, result.data]);
          setIndex(index + 1);
        }
      } catch {
        setMessage(
          "The request failed. Refresh transactions or try again shortly.",
        );
      }
    });
  }

  return (
    <Card aria-busy={busy}>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle>Transactions in block</CardTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh transactions"
          title="Refresh transactions"
          disabled={busy}
          onClick={() => load(true)}
        >
          <RefreshCwIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {page.activity.length ? (
          <ul role="list" className="divide-y" aria-label="Block transactions">
            {page.activity.map((transaction) => (
              <TransactionActivityRow
                key={transaction.hash}
                transaction={transaction}
                showIcon={false}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {index === 0 && page.cursor === null
              ? "No transactions in this indexed block."
              : "No transactions on this page."}
          </p>
        )}
        {message ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        <nav
          aria-label="Transaction pagination"
          className="flex justify-end gap-2"
        >
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            title="Previous page"
            disabled={busy || index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            title="Next page"
            disabled={
              busy ||
              page.cursor === null ||
              (index === pages.length - 1 && invalidContinuation)
            }
            onClick={() => load()}
          >
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </nav>
      </CardContent>
    </Card>
  );
}
