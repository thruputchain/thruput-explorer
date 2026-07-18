"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

type SearchResponse =
  | { status: "ok"; href: string }
  | { status: "malformed" | "unavailable"; message: string };

export function SearchHero() {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTransactionHash(hash);

    if (!isTransactionHash(normalized)) {
      setError("Enter a 0x-prefixed 32-byte transaction hash or address.");
      return;
    }

    setError(null);
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: normalized }),
    });
    const result = (await response.json()) as SearchResponse;

    if (result.status !== "ok") {
      setError(result.message);
      return;
    }

    startTransition(() => router.push(result.href));
  }

  return (
    <section className="flex flex-col justify-center gap-8 pt-16 mx-auto max-w-2xl">
      <div className="flex flex-col gap-3 justify-center text-center">
        <p className="text-sm font-medium tracking-[0.3em] text-muted-foreground uppercase">
          Groundhog Devnet Explorer
        </p>
        <h1 className="text-4xl leading-none font-semibold tracking-tight text-balance sm:text-5xl">
          Search for transactions, wallets, and contracts.
        </h1>
      </div>

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Transaction search</CardTitle>
          <CardDescription>
            Search for a transaction hash or address to view details, events,
            and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
            <div className="flex flex-1 flex-col gap-2">
              <Input
                aria-invalid={error ? true : undefined}
                value={hash}
                onChange={(event) => setHash(event.target.value)}
                placeholder="0x0000"
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <Button type="submit" disabled={isPending}>
              <SearchIcon data-icon="inline-start" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
