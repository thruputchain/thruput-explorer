"use client";

import { useEffect, useRef, useState } from "react";
import { discoverWalletProviders, parseWalletSession, type WalletProvider } from "@thruputchain/client/provider";

/** Read-only wallet connection: never creates a signing client or sends transactions. */
export function useWalletShortcut() {
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<WalletProvider | null>(null);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const revision = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const lifecycle = revision;
    const stop = discoverWalletProviders((provider) => setProviders((current) => current.some((item) => item.info.id === provider.info.id) ? current : [...current, provider]));
    return () => {
      stop();
      lifecycle.current++;
      unsubscribe.current?.();
      active.current = null;
    };
  }, []);

  async function connect(provider?: WalletProvider) {
    if (pending.current) return;
    if (!provider) {
      setError("No Thruput wallet found. Open your wallet extension, then try again.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    const attempt = ++revision.current;
    unsubscribe.current?.();
    active.current = provider;
    let changed = false;
    function update(value: unknown) {
      if (revision.current !== attempt) return;
      const session = parseWalletSession(value);
      setAddress(session.accounts[0]?.address ?? null);
    }
    try {
      unsubscribe.current = provider.on("change", (value) => {
        if (revision.current !== attempt) return;
        changed = true;
        try { update(value); } catch {
          setAddress(null);
          setError("The wallet returned an invalid account. Connect again.");
        }
      });
      const session = await provider.request({ method: "connect" });
      if (revision.current !== attempt) return;
      if (!changed) update(session);
      // Validate responses even when a change event already supplied the current state.
      if (!parseWalletSession(session).accounts.length) throw new Error("No authorized account");
    } catch {
      if (revision.current === attempt) {
        unsubscribe.current?.();
        active.current = null;
        setAddress(null);
        setError("Could not connect. Approve the request in your wallet and try again.");
      }
    } finally {
      pending.current = false;
      if (revision.current === attempt) setBusy(false);
    }
  }

  async function disconnect() {
    if (pending.current) return;
    const provider = active.current;
    const attempt = ++revision.current;
    unsubscribe.current?.();
    active.current = null;
    setAddress(null);
    setError(null);
    setBusy(true);
    pending.current = true;
    try {
      await provider?.request({ method: "disconnect" });
    } catch {
      if (revision.current === attempt) setError("Disconnected here. Revoke this site's access in your wallet if needed.");
    } finally {
      pending.current = false;
      if (revision.current === attempt) setBusy(false);
    }
  }

  return { providers, address, busy, error, connect, disconnect };
}
