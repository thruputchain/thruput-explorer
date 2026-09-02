"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error }: { error: Error & { digest?: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">Error</p>
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">This page could not be loaded. Please try again in a moment.</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <Button render={<Link href="/" />} variant="outline">
        Back to search
      </Button>
    </main>
  );
}
