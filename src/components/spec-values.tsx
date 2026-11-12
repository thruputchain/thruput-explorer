import type { SpecArgumentView } from "@/lib/thruput/spec-format";

/** Shared named values for decoded calls and event fields. */
export function SpecValues({
  values,
  emptyLabel = "No arguments.",
}: {
  values: SpecArgumentView[];
  emptyLabel?: string;
}) {
  if (!values.length)
    return (
      <p className="text-base text-muted-foreground sm:text-sm">{emptyLabel}</p>
    );
  return (
    <dl className="flex min-w-0 flex-col divide-y divide-border/60">
      {values.map((arg) => (
        <div
          key={arg.name}
          className="grid min-w-0 grid-cols-1 gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
        >
          <dt className="font-mono text-base font-medium wrap-anywhere sm:text-sm">
            {arg.name}{" "}
            <span className="font-normal text-muted-foreground">
              ({arg.type})
            </span>
          </dt>
          <dd className="min-w-0 whitespace-pre-wrap font-mono text-base tabular-nums wrap-anywhere sm:text-sm">
            {arg.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
