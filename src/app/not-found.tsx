import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="app-container flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="app-page-title">Page not found</h1>
      <p className="max-w-md text-muted-foreground">Search for a transaction hash or address to explore Thruput.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to search</Link>
      </Button>
    </main>
  );
}
