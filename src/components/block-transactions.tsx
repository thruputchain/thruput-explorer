"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { nextBlockTransactions } from "@/app/block/[height]/actions";
import { Button } from "@/components/ui/button";
import type { BlockPage } from "@/lib/thruput/blocks";
import { checkBlockContinuation } from "@/lib/thruput/block-pagination";

export function BlockTransactions({
  height,
  initial,
}: {
  height: string;
  initial: BlockPage;
}) {
  const [page, setPage] = useState(initial);
  const [continued, setContinued] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const seen = useRef(new Set([initial.cursor]));

  function next() {
    startTransition(async () => {
      try {
        const result = await nextBlockTransactions(height, page.cursor);
        if (result.status !== "ok") {
          setMessage(result.message);
          return;
        }
        if (!checkBlockContinuation(page, result.data, seen.current)) {
          setMessage(
            "The transaction index changed. Reload transactions to return to the first page.",
          );
          return;
        }
        seen.current.add(result.data.cursor);
        setPage(result.data);
        setContinued(true);
      } catch {
        setMessage("The request failed. Reload transactions or try again shortly.");
      }
    });
  }

  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Block transactions"
      aria-busy={pending}
    >
      <ul role="list" className="divide-y divide-foreground/10">
        {page.hashes.map((hash) => (
          <li
            className="break-all py-3 font-mono text-sm"
            key={hash}
          >
            <Link className="underline-offset-4 hover:underline" href={`/tx/${hash}`}>
              {hash}
            </Link>
          </li>
        ))}
      </ul>
      <div role="status" className="text-base text-muted-foreground sm:text-sm">
        {message ||
          (page.cursor === "0x"
            ? continued
              ? "No further references returned. A stale cursor can also end a list; completeness is not verified."
              : page.hashes.length === 0
                ? "No transactions in this indexed block."
                : "No further references returned."
            : `${page.hashes.length} references on this page.`)}
      </div>
      <nav aria-label="Transaction pagination" className="flex flex-wrap gap-4">
        <Button
          variant="outline"
          disabled={pending || page.cursor === "0x" || Boolean(message)}
          onClick={next}
        >
          Next page
        </Button>
        <Button asChild variant="outline">
          <a href={`/block/${height}/transactions`}>Reload transactions</a>
        </Button>
      </nav>
    </section>
  );
}
