import { Badge } from "@/components/ui/badge";
import type { TransactionStatusView } from "@/lib/thruput/types";

export function StatusBadge({ status }: { status: TransactionStatusView }) {
  if (status.status === "committed") return <Badge variant="success">Committed</Badge>;
  if (status.status === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (status.status === "retry") return <Badge variant="secondary">Retry</Badge>;
  if (status.status === "dropped") return <Badge variant="destructive">Dropped</Badge>;
  if (status.status === "invalid") return <Badge variant="destructive">Invalid</Badge>;
  if (status.status === "recentFailure") return <Badge variant="destructive">Recent failure</Badge>;
  if (status.status === "other") return <Badge variant="outline">Other</Badge>;
  if (status.status === "unavailable") return <Badge variant="destructive">RPC unavailable</Badge>;
  if (status.status === "malformed") return <Badge variant="destructive">Invalid hash</Badge>;
  return <Badge variant="outline">Unknown</Badge>;
}
