import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RpcFailure } from "@/lib/thruput/types";

export function RpcAlert({ title, description, error }: { title: string; description?: string; error?: RpcFailure }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description ? <p>{description}</p> : null}
        {error ? <p>{formatRpcFailure(error)}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

function formatRpcFailure(error: RpcFailure) {
  const details = [error.method, error.code == null ? undefined : `code ${error.code}`].filter(Boolean).join(", ");
  return details ? `${error.message} (${details})` : error.message;
}
