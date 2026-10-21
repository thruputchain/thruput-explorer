import { Badge } from "@/components/ui/badge";
import type { DecodedEventView } from "@/lib/thruput/types";

const eventStyles = {
  "token-transfer": { label: "Transfer", variant: "transfer" },
  "token-mint": { label: "Mint", variant: "success" },
  "token-burn": { label: "Burn", variant: "burn" },
} as const;

export function TokenEventBadge({ kind }: { kind: DecodedEventView["kind"] }) {
  const { label, variant } = eventStyles[kind];
  return <Badge variant={variant}>{label}</Badge>;
}
