/** Reconnect hint sent first so the browser retries quickly after a dropped connection. */
export const SSE_RETRY_HINT = "retry: 3000\n\n";
/** Comment frame that keeps proxies from closing an idle stream. */
export const SSE_HEARTBEAT = ": ping\n\n";
export const SSE_HEARTBEAT_MS = 15_000;

export function formatSseMessage(event: string, data: unknown) {
  // JSON.stringify never emits raw newlines, so one data line is always enough.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
