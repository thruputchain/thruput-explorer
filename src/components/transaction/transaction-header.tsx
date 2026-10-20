import { PageHeader } from "@/components/page-header";
import type { TransactionPageData } from "@/lib/thruput/types";

export function TransactionHeader({ data }: { data: TransactionPageData }) {
  return (
    <PageHeader eyebrow="Transaction" title="Transaction" value={data.hash} copyLabel="Copy transaction hash" />
  );
}
