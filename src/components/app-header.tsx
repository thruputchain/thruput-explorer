import { ActivityIcon, ZapIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="app-container flex min-h-20 items-center py-3 lg:min-h-22">
        <Link href="/" aria-label="Thruput Explorer homepage" className="flex min-h-12 items-center gap-2.5">
          <ZapIcon className="size-6 shrink-0 fill-primary text-primary" aria-hidden="true" />
          <span className="flex flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-3">
            <span className="text-xl font-medium tracking-tight">THRUPUT</span>
            <span className="font-mono text-xs text-muted-foreground lg:border-l lg:pl-3">Explorer</span>
          </span>
        </Link>
        <nav aria-label="Explorer sections" className="ml-auto">
          <Button asChild variant="ghost" size="sm">
            <Link href="/live" prefetch={false}>
              <ActivityIcon data-icon="inline-start" aria-hidden="true" />
              Live transactions
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
