"use client";

import Link from "next/link";
import { ChevronDownIcon, LogOutIcon, WalletIcon } from "lucide-react";
import { useWalletShortcut } from "@/hooks/use-wallet-shortcut";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function WalletMenu() {
  const wallet = useWalletShortcut();
  return (
    <div className="flex max-w-full flex-col items-end gap-2">
      {wallet.address ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="Wallet menu">
              <WalletIcon data-icon="inline-start" />
              {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem asChild><Link href={`/address/${wallet.address}`}><WalletIcon />View wallet</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void wallet.disconnect()}><LogOutIcon />Disconnect</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : wallet.providers.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" disabled={wallet.busy}>{wallet.busy ? "Please wait…" : "Connect"}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {wallet.providers.map((provider) => <DropdownMenuItem key={provider.info.id} onSelect={() => void wallet.connect(provider)}>{provider.info.name}</DropdownMenuItem>)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" disabled={wallet.busy} onClick={() => void wallet.connect(wallet.providers[0])}>
          <WalletIcon data-icon="inline-start" />{wallet.busy ? "Please wait…" : "Connect"}
        </Button>
      )}
      {wallet.error ? <Alert className="max-w-sm"><AlertDescription>{wallet.error}</AlertDescription></Alert> : null}
    </div>
  );
}
