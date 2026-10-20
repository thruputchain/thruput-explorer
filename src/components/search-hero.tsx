"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { isBlockHeight, isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

type SearchResponse =
  | { status: "ok"; href: string }
  | { status: "malformed" | "unavailable"; message: string };

export function SearchHero() {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTransactionHash(hash);

    if (!isBlockHeight(normalized) && !isTransactionHash(normalized)) {
      setError("Enter a block height or a base58 transaction hash or address (32 bytes).");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
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
      } catch {
        setError("Search is unavailable. Please try again.");
      }
    });
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-center text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">Search blocks, transactions, contracts, and addresses on Thruput.</h1>

      <form onSubmit={submit} aria-label="Explorer search">
        <FieldGroup>
          <Field className="flex-1" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="explorer-search" className="sr-only">Block height, transaction hash or address</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="explorer-search"
                name="query"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "search-error" : undefined}
                value={hash}
                onChange={(event) => setHash(event.target.value)}
                placeholder="Block height, transaction hash or address"
              />
              <InputGroupAddon>
                <Button type="submit" variant="outline" size="lg" className="h-10" disabled={isPending} aria-busy={isPending}>
                  <SearchIcon data-icon="inline-start" />
                  Search
                </Button>
              </InputGroupAddon>
            </InputGroup>
            {error ? <FieldError id="search-error">{error}</FieldError> : null}
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
