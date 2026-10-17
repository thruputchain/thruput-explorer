import { ZapIcon } from "lucide-react";
import Link from "next/link";
import { WalletMenu } from "./wallet-menu";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="app-container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3 lg:min-h-22">
        <Link href="/" aria-label="Thruput Explorer homepage" className="flex min-h-12 items-center gap-2.5">
          <ZapIcon className="size-6 shrink-0 fill-primary text-primary" aria-hidden="true" />
          <span className="flex flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-3">
            <span className="text-xl font-medium tracking-tight">THRUPUT</span>
            <span className="font-mono text-xs text-muted-foreground lg:border-l lg:pl-3">Explorer</span>
          </span>
        </Link>
        <WalletMenu />
      </div>
    </header>
  );
}
