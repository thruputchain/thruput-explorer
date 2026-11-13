import Link from "next/link";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  value,
  badges = [],
  copyLabel,
  backHref = "/",
  backLabel = "Back to search",
  actions,
}: {
  title: string;
  value: string;
  badges?: string[];
  copyLabel: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b">
      <div className="app-container flex flex-col gap-4 py-6 sm:py-8">
        {badges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {badges.map((badge) => (
              <Badge key={badge} variant="secondary">
                {badge}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h1 className="app-page-title wrap-anywhere">{title}</h1>
            <div className="flex w-full min-w-0 items-center gap-2">
              <code className="min-w-0 break-all text-sm text-muted-foreground">
                {value}
              </code>
              <CopyButton value={value} label={copyLabel} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            <Button asChild variant="secondary" size="sm">
              <Link href={backHref}>{backLabel}</Link>
            </Button>
            {actions}
          </div>
        </div>
      </div>
    </header>
  );
}
