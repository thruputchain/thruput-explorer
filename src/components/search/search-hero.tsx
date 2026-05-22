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
    <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex max-w-3xl flex-col gap-2">
        <h2 className="uppercase text-lg font-mono">Groundhog Protocol</h2>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Transaction Explorer
        </h1>
      </div>

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Transaction search</CardTitle>
          <CardDescription>
            Search for a transaction by its hash to view details, events, and
            more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
            <div className="flex flex-1 flex-col gap-2 min-h-10">
              <Input
                aria-invalid={error ? true : undefined}
                value={hash}
                onChange={(event) => setHash(event.target.value)}
                placeholder="Search transaction hash (e.g. 0x1234abcd)"
                className="font-mono h-10 md:text-xl"
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
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
