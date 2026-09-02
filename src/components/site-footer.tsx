const PREVIEW_NOTICE = "Devnet is an early technology preview and may be reset without notice.";

export function SiteFooter() {
  const faucetUrl = process.env.NEXT_PUBLIC_FAUCET_URL?.trim();
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL?.trim();

  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{PREVIEW_NOTICE}</p>
        {faucetUrl || docsUrl ? (
          <nav className="flex items-center gap-4">
            {faucetUrl ? (
              <a className="underline underline-offset-4 hover:text-foreground" href={faucetUrl} rel="noreferrer">
                Faucet
              </a>
            ) : null}
            {docsUrl ? (
              <a className="underline underline-offset-4 hover:text-foreground" href={docsUrl} rel="noreferrer">
                Docs
              </a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
