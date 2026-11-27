import { readSnapshot } from "@/features/book-one/services/pilot-server";
import { readStellarSession } from "@/features/book-one/auth/stellar-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const user = await readStellarSession(request);
  if (!user) return new Response("Sign in required", { status: 401 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  let previous = "";
  const deadline = Date.now() + 50000;
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (ended) return;
        ended = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", close, { once: true });
      const tick = async () => {
        if (ended) return;
        try {
          const active = await readStellarSession(request);
          if (
            !active ||
            active.wallet !== user.wallet ||
            Date.now() > deadline
          ) {
            close();
            return;
          }
          const snapshot = await readSnapshot(active);
          if (ended) return;
          const value = JSON.stringify(snapshot);
          if (value !== previous) {
            controller.enqueue(
              encoder.encode("event: snapshot\ndata: " + value + "\n\n"),
            );
            previous = value;
          } else controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (!ended)
            controller.enqueue(encoder.encode("event: delayed\ndata: {}\n\n"));
        }
        if (!ended)
          timer = setTimeout(() => {
            void tick();
          }, 3500);
      };
      void tick();
    },
    cancel() {
      ended = true;
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
