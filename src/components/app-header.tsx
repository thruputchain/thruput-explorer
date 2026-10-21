import Image from "next/image";
import Link from "next/link";
import { WalletMenu } from "./wallet-menu";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="app-container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3 lg:min-h-22">
        <Link href="/" aria-label="Thruput Explorer homepage" className="flex min-h-12 items-center gap-2.5 text-foreground">
          <div className="flex items-center gap-2 whitespace-nowrap text-[17px] font-medium min-[384px]:gap-3 min-[384px]:text-xl">
            <picture className="shrink-0">
              <source srcSet="/brand/stellar-dark.svg" media="(prefers-color-scheme: dark)" />
              <Image src="/brand/stellar.svg" width={100} height={25} alt="Stellar" className="h-auto w-20 min-[384px]:w-25" unoptimized />
            </picture>
            <span className="border-l pl-2 min-[384px]:pl-3">Thruput Explorer</span>
          </div>
        </Link>
        <WalletMenu />
      </div>
    </header>
  );
}
