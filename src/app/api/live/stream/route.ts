import { getLiveHub } from "@/lib/groundhog/live/hub";
import { SSE_HEARTBEAT, SSE_HEARTBEAT_MS, SSE_RETRY_HINT, formatSseMessage } from "@/lib/groundhog/live/sse";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const hub = getLiveHub();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      write(SSE_RETRY_HINT);
      write(formatSseMessage("hello", hub.snapshot()));
      const unsubscribe = hub.subscribe((message) => write(formatSseMessage(message.type, message)));
      const heartbeat = setInterval(() => write(SSE_HEARTBEAT), SSE_HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // The consumer already went away.
        }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps Next's compression from buffering the stream.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
