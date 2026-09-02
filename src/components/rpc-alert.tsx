import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RpcFailure } from "@/lib/groundhog/types";

const GENERIC_FAILURE_MESSAGE = "The explorer could not reach the Groundhog network. Please try again in a moment.";

export function RpcAlert({ title, description, error }: { title: string; description?: string; error?: RpcFailure }) {
  const detail = error ? formatRpcFailure(error) : undefined;
  const isProduction = process.env.NODE_ENV === "production";

  // Method names, RPC error codes and node error strings are internals: log them where
  // an operator can read them instead of rendering them to anonymous visitors.
  if (detail && isProduction) console.error(`[explorer] ${title}: ${detail}`);

  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description ? <p>{description}</p> : null}
        {detail ? <p>{isProduction ? GENERIC_FAILURE_MESSAGE : detail}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

function formatRpcFailure(error: RpcFailure) {
  const details = [error.method, error.code == null ? undefined : `code ${error.code}`].filter(Boolean).join(", ");
  return details ? `${error.message} (${details})` : error.message;
}
