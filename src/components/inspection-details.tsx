import type { ReactNode } from "react";

/** Native disclosures keep technical evidence accessible without client JavaScript. */
export function InspectionDetails({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="min-w-0 text-base sm:text-sm">
      <summary className="cursor-pointer rounded-sm py-2 text-muted-foreground hover:text-foreground focus-visible:bg-muted focus-visible:outline-none">
        {title}
      </summary>
      <div className="flex min-w-0 flex-col gap-4 py-3">{children}</div>
    </details>
  );
}

export function RawInput({ value, label }: { value: string; label: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-h-80 min-w-0 overflow-auto rounded-md bg-muted p-4 font-mono text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm"
    >
      {value}
    </pre>
  );
}
