"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function copy() {
    startTransition(async () => {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Button type="button" variant="ghost" onClick={copy} disabled={isPending}>
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
    </Button>
  );
}
