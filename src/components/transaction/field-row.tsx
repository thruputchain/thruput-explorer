import type { ReactNode } from "react";

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="font-mono text-xs uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 font-sans text-sm text-foreground">{children}</dd>
    </div>
  );
}
