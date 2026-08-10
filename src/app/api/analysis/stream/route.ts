import { NextRequest } from "next/server";
import { analyzePosition } from "@/lib/stockfish-analysis";
import { createSanTranslator } from "@/lib/chess-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fen = searchParams.get("fen");
  const depth = parseInt(searchParams.get("depth") || "20", 10);
  const multiPV = parseInt(searchParams.get("multipv") || "1", 10);

  if (!fen) {
    return new Response("Missing fen", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`));
      } catch (e) {}

      const translator = createSanTranslator(fen);
      const analysis = await analyzePosition(
        fen,
        depth,
        20, // skillLevel
        translator,
        (progress) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`));
          } catch (e) {}
        }, 
        req.signal,
        0, // movetime 0 means no time limit, search until depth or aborted
        multiPV
      );

      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', ...analysis })}\n\n`));
        controller.close();
      } catch (e) {}
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
