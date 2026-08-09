import { NextRequest } from "next/server";
import { analyzePosition } from "@/lib/stockfish-analysis";
import { createSanTranslator } from "@/lib/chess-engine";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fen = searchParams.get("fen");
  const depth = parseInt(searchParams.get("depth") || "20", 10);

  if (!fen) {
    return new Response("Missing fen", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`));

      const translator = createSanTranslator(fen);
      const analysis = await analyzePosition(
        fen,
        depth,
        20, // skillLevel
        translator,
        (progress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`));
      }, req.signal);

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', ...analysis })}\n\n`));
      controller.close();
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
