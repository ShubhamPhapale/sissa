import { pgTable, serial, text, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  rating: integer("rating").notNull().default(1500),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const games = pgTable("games", {
  id: text("id").primaryKey(),
  whitePlayerId: integer("white_player_id").references(() => users.id),
  blackPlayerId: integer("black_player_id").references(() => users.id),
  whitePlayerName: varchar("white_player_name", { length: 50 }),
  blackPlayerName: varchar("black_player_name", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("waiting"), // waiting, playing, finished
  winner: varchar("winner", { length: 5 }), // 'w' | 'b' | 'draw'
  endReason: varchar("end_reason", { length: 30 }), // checkmate, stalemate, resignation, timeout, agreement, ...
  drawOfferedBy: varchar("draw_offered_by", { length: 1 }), // 'w' | 'b'
  fen: text("fen").notNull().default("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
  pgn: text("pgn").notNull().default(""),
  timeControl: integer("time_control").notNull().default(600), // seconds per player
  increment: integer("increment").notNull().default(0), // seconds added after each move
  whiteTimeRemaining: integer("white_time_remaining").notNull().default(600),
  blackTimeRemaining: integer("black_time_remaining").notNull().default(600),
  lastMoveAt: timestamp("last_move_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const moves = pgTable("moves", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => games.id),
  moveNumber: integer("move_number").notNull(),
  san: varchar("san", { length: 10 }).notNull(),
  from: varchar("from", { length: 2 }).notNull(),
  to: varchar("to", { length: 2 }).notNull(),
  piece: varchar("piece", { length: 1 }).notNull(),
  captured: varchar("captured", { length: 1 }),
  promotion: varchar("promotion", { length: 1 }),
  check: boolean("check").notNull().default(false),
  checkmate: boolean("checkmate").notNull().default(false),
  castle: varchar("castle", { length: 1 }), // K or Q
  enPassant: boolean("en_passant").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
