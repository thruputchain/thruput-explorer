import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PageHeader({
  eyebrow,
  title,
  value,
  badges = [],
  copyLabel,
  backHref = "/",
  backLabel = "Back to search",
}: {
  eyebrow: string;
  title: string;
  value: string;
  badges?: string[];
  copyLabel: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {eyebrow}
          </p>
          {badges.map((badge) => (
            <Badge key={badge} variant="secondary">
              {badge}
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <code className="break-all text-sm text-muted-foreground">
              {value}
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={value} label={copyLabel} />
            <Button
              render={<Link href={backHref} />}
              nativeButton={false}
              variant="secondary"
              size="sm"
            >
              {backLabel}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
