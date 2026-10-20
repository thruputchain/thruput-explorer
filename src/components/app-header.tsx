import Image from "next/image";
import Link from "next/link";
import { WalletMenu } from "./wallet-menu";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="app-container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3 lg:min-h-22">
        <Link href="/" aria-label="Thruput Explorer homepage" className="flex min-h-12 items-center gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 text-sm font-medium">
              <picture className="shrink-0">
                <source srcSet="/brand/stellar-dark.svg" media="(prefers-color-scheme: dark)" />
                <Image src="/brand/stellar.svg" width={100} height={25} alt="Stellar" unoptimized />
              </picture>
              <span className="border-l pl-3">Thruput</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">Explorer</div>
          </div>
        </Link>
        <WalletMenu />
      </div>
    </header>
  );
}
