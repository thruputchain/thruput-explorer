"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [isPending, setIsPending] = useState(false);

  async function copy() {
    setIsPending(true);
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    } finally {
      setIsPending(false);
      window.setTimeout(() => setStatus("idle"), 1500);
    }
  }

  return (
    <Button type="button" variant="ghost" onClick={copy} disabled={isPending} aria-label={status === "failed" ? "Copy failed" : "Copy transaction hash"}>
      {status === "copied" ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
    </Button>
  );
}
