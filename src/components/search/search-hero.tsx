"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

export function SearchHero() {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTransactionHash(hash);

    if (!isTransactionHash(normalized)) {
      setError("Enter a 0x-prefixed 32-byte transaction hash.");
      return;
    }

    setError(null);
    startTransition(() => router.push(`/tx/${normalized}`));
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-sm text-muted-foreground">Groundhog local explorer</p>
        <div className="flex max-w-3xl flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Inspect a transaction without leaving your local node.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Search by transaction hash to inspect status, receipt data, emitted events, and local dev execution detail.
          </p>
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Transaction search</CardTitle>
          <CardDescription>Only transaction hashes are supported in this MVP.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
            <div className="flex flex-1 flex-col gap-2">
              <Input
                aria-invalid={error ? true : undefined}
                value={hash}
                onChange={(event) => setHash(event.target.value)}
                placeholder="0x..."
                className="font-mono"
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <Button type="submit" size="lg" disabled={isPending}>
              <SearchIcon data-icon="inline-start" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
