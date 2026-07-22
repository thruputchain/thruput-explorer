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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 py-5 px-4 md:px-0">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex flex-col items-start md:items-center md:flex-row gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <code className="break-all text-sm text-muted-foreground">
              {value}
            </code>
            <CopyButton value={value} label={copyLabel} />
          </div>
          <Button
            render={<Link href={backHref} />}
            nativeButton={false}
            variant="secondary"
            size="sm"
            className="md:ml-auto"
          >
            {backLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}
