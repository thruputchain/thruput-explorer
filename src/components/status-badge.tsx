import { Badge } from "@/components/ui/badge";
import type { TransactionStatusView } from "@/lib/groundhog/types";

export function StatusBadge({ status }: { status: TransactionStatusView }) {
  if (status.kind === "committed") return <Badge>Committed</Badge>;
  if (status.kind === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (status.kind === "invalid") return <Badge variant="destructive">Invalid</Badge>;
  if (status.kind === "unavailable") return <Badge variant="destructive">RPC unavailable</Badge>;
  return <Badge variant="outline">Unknown</Badge>;
}
