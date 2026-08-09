import { db, pool } from "@/db";
import { games, users, moves as movesTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  algebraicToSquare,
  applyMove,
  createInitialState,
  generateLegalMoves,
  parseFEN,
  stateToFEN,
  type Color,
} from "@/lib/chess-engine";

export type GameRow = typeof games.$inferSelect;
export type MoveRow = typeof movesTable.$inferSelect;

export const MIN_TIME_CONTROL = 30;
export const MAX_TIME_CONTROL = 10800;

/**
 * Computes how many whole seconds the side to move has burned since the clock
 * last started. Clocks are derived on the server so both clients always agree.
 */
export function elapsedSecondsFor(game: GameRow): number {
  if (game.status !== "playing") return 0;
  
  // If lastMoveAt is present, it's not the very first move.
  const since = game.lastMoveAt ?? game.createdAt;
  if (!since) return 0;
  
  let ms = Date.now() - new Date(since).getTime();
  
  // Grace period before clock starts running down for the first move
  if (!game.lastMoveAt) {
    const estimatedDuration = game.timeControl + 40 * game.increment;
    let graceMs = 0;
    if (estimatedDuration < 180) graceMs = 0; // bullet
    else if (estimatedDuration < 480) graceMs = 5000; // blitz
    else if (estimatedDuration < 1500) graceMs = 10000; // rapid
    else graceMs = 15000; // classical

    ms = Math.max(0, ms - graceMs);
  }

  return Math.max(0, Math.floor(ms / 1000));
}

/** Returns the authoritative clocks right now, without writing to the DB. */
export function liveClocks(game: GameRow): { white: number; black: number; turn: Color } {
  const turn = (parseFEN(game.fen).turn ?? "w") as Color;
  const elapsed = elapsedSecondsFor(game);
  return {
    white: turn === "w" ? Math.max(0, game.whiteTimeRemaining - elapsed) : game.whiteTimeRemaining,
    black: turn === "b" ? Math.max(0, game.blackTimeRemaining - elapsed) : game.blackTimeRemaining,
    turn,
  };
}

/** True when the side to move has run out of time. */
export function hasFlagged(game: GameRow): { flagged: boolean; loser: Color | null } {
  if (game.status !== "playing") return { flagged: false, loser: null };
  const { white, black, turn } = liveClocks(game);
  if (turn === "w" && white <= 0) return { flagged: true, loser: "w" };
  if (turn === "b" && black <= 0) return { flagged: true, loser: "b" };
  return { flagged: false, loser: null };
}

function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** Standard Elo update with K=32. */
export function eloUpdate(
  whiteRating: number,
  blackRating: number,
  winner: "w" | "b" | "draw"
): { white: number; black: number } {
  const K = 32;
  const scoreWhite = winner === "w" ? 1 : winner === "draw" ? 0.5 : 0;
  const expWhite = expectedScore(whiteRating, blackRating);
  const newWhite = Math.round(whiteRating + K * (scoreWhite - expWhite));
  const newBlack = Math.round(blackRating + K * ((1 - scoreWhite) - (1 - expWhite)));
  return { white: newWhite, black: newBlack };
}

/**
 * Ends a game exactly once and applies rating / W-L-D changes.
 * Safe to call concurrently: the UPDATE is guarded on status = 'playing'.
 */
export async function finalizeGame(
  gameId: string,
  winner: "w" | "b" | "draw",
  endReason: string,
  clocks?: { white: number; black: number }
): Promise<GameRow | null> {
  const [updated] = await db
    .update(games)
    .set({
      status: "finished",
      winner,
      endReason,
      drawOfferedBy: null,
      ...(clocks
        ? { whiteTimeRemaining: Math.max(0, clocks.white), blackTimeRemaining: Math.max(0, clocks.black) }
        : {}),
      updatedAt: new Date(),
    })
    .where(sql`${games.id} = ${gameId} AND ${games.status} = 'playing'`)
    .returning();

  // Another request already finished this game — don't double-apply ratings.
  if (!updated) {
    const [existing] = await db.select().from(games).where(eq(games.id, gameId));
    return existing ?? null;
  }

  if (updated.whitePlayerId && updated.blackPlayerId && updated.whitePlayerId !== updated.blackPlayerId && endReason !== "aborted") {
    const [white] = await db.select().from(users).where(eq(users.id, updated.whitePlayerId));
    const [black] = await db.select().from(users).where(eq(users.id, updated.blackPlayerId));
    if (white && black) {
      // Classify game type
      const estimatedDuration = updated.timeControl + 40 * updated.increment;
      let ratingType: "bullet" | "blitz" | "rapid" | "classical" = "classical";
      if (estimatedDuration < 180) ratingType = "bullet";
      else if (estimatedDuration < 480) ratingType = "blitz";
      else if (estimatedDuration < 1500) ratingType = "rapid";

      const ratingKey = (ratingType + "Rating") as "bulletRating" | "blitzRating" | "rapidRating" | "classicalRating";

      const next = eloUpdate(white[ratingKey], black[ratingKey], winner);
      await db
        .update(users)
        .set({
          [ratingKey]: next.white,
          rating: next.white,
          wins: white.wins + (winner === "w" ? 1 : 0),
          losses: white.losses + (winner === "b" ? 1 : 0),
          draws: white.draws + (winner === "draw" ? 1 : 0),
        })
        .where(eq(users.id, white.id));
      await db
        .update(users)
        .set({
          [ratingKey]: next.black,
          rating: next.black,
          wins: black.wins + (winner === "b" ? 1 : 0),
          losses: black.losses + (winner === "w" ? 1 : 0),
          draws: black.draws + (winner === "draw" ? 1 : 0),
        })
        .where(eq(users.id, black.id));
    }
  }

  return updated;
}

/** Applies a flag-fall if the side to move is out of time. Returns the current row. */
export async function settleTimeout(game: GameRow): Promise<GameRow> {
  const { flagged, loser } = hasFlagged(game);
  if (!flagged || !loser) return game;
  const winner = loser === "w" ? "b" : "w";
  const finished = await finalizeGame(game.id, winner, "timeout", {
    white: loser === "w" ? 0 : game.whiteTimeRemaining,
    black: loser === "b" ? 0 : game.blackTimeRemaining,
  });
  return finished ?? game;
}

/** Adds derived, always-current clock values to a game row for API responses. */
export function serializeGame(game: GameRow) {
  const clocks = liveClocks(game);
  return {
    ...game,
    whiteTimeRemaining: clocks.white,
    blackTimeRemaining: clocks.black,
    turn: clocks.turn,
    serverTime: Date.now(),
  };
}

import { EventEmitter } from "events";

const globalForEvents = globalThis as typeof globalThis & {
  __arenaGameEmitter?: EventEmitter;
};
export const gameEmitter = globalForEvents.__arenaGameEmitter ?? new EventEmitter();
if (process.env.NODE_ENV !== "production") {
  globalForEvents.__arenaGameEmitter = gameEmitter;
}

/** Notifies listening clients that a game has been updated. */
export async function notifyGameUpdate(gameId: string) {
  try {
    gameEmitter.emit(`game_update_${gameId}`);
  } catch (error) {
    console.error("Failed to notify game update:", error);
  }
}

/** The repetition key is the FEN without the move counters. */
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Replays the game and returns how many times the final position has occurred.
 * Three occurrences is a draw by threefold repetition (FIDE 9.2).
 */
export function repetitionCount(
  moveRows: Array<{ from: string; to: string; promotion: string | null }>
): number {
  let state = createInitialState();
  const counts = new Map<string, number>();
  const bump = (fen: string) => {
    const key = positionKey(fen);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return next;
  };

  bump(stateToFEN(state));
  let last = 1;

  for (const row of moveRows) {
    const from = algebraicToSquare(row.from);
    const to = algebraicToSquare(row.to);
    const legal = generateLegalMoves(state, state.turn);
    const found = legal.find(
      (m) =>
        m.from.row === from.row &&
        m.from.col === from.col &&
        m.to.row === to.row &&
        m.to.col === to.col &&
        (row.promotion ? m.promotion === row.promotion : !m.promotion)
    );
    if (!found) return last;
    state = applyMove(state, found);
    last = bump(stateToFEN(state));
  }

  return last;
}

/** Builds standard PGN movetext, e.g. "1. e4 e5 2. Nf3 Nc6". */
export function buildPgn(sanList: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sanList.length; i += 2) {
    const number = i / 2 + 1;
    const white = sanList[i];
    const black = sanList[i + 1];
    parts.push(black ? `${number}. ${white} ${black}` : `${number}. ${white}`);
  }
  return parts.join(" ");
}

/** Finds an existing user by name or creates one. Returns null for blank names. */
export async function upsertUser(username?: string | null) {
  const name = (username ?? "").trim().slice(0, 50);
  if (!name) return null;
  const [existing] = await db.select().from(users).where(eq(users.username, name));
  if (existing) return existing;
  try {
    const [created] = await db.insert(users).values({ username: name, passwordHash: "dummy" }).returning();
    return created;
  } catch {
    // Lost a race with a concurrent insert — read it back.
    const [raced] = await db.select().from(users).where(eq(users.username, name));
    return raced ?? null;
  }
}
