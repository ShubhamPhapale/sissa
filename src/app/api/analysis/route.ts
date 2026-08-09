import { NextRequest, NextResponse } from "next/server";
import { analyzePosition } from "@/lib/stockfish-analysis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const fen = String(body.fen ?? "").trim();
    const depth = Number(body.depth ?? 20);

    if (!fen) {
      return NextResponse.json({ error: "Missing FEN" }, { status: 400 });
    }

    const analysis = await analyzePosition(fen, Number.isFinite(depth) ? depth : 20);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error analyzing position:", error);
    return NextResponse.json({ error: "Failed to analyze position" }, { status: 500 });
  }
}
