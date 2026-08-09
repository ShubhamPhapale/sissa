import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password || username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: "Username must be 3+ chars and password 6+ chars" },
        { status: 400 }
      );
    }

    // Check if user exists
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        rating: 1500, // starting ELO
      })
      .returning();

    // Set session
    await setSessionCookie({ userId: newUser.id, username: newUser.username });

    return NextResponse.json({ 
      user: { id: newUser.id, username: newUser.username, rating: newUser.rating } 
    }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
