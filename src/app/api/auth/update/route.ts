import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username, password } = await req.json();

    if (username && username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }
    
    if (password && password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const updateData: any = {};

    // Update username if requested and different
    if (username && username !== session.username) {
      // Check for conflicts
      const [existing] = await db.select().from(users).where(ilike(users.username, username));
      if (existing) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      updateData.username = username;
    }

    // Hash new password if requested
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No changes made" }, { status: 200 });
    }

    // Update user
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, session.userId))
      .returning();

    // If username changed, update session cookie
    if (updateData.username) {
      await setSessionCookie({ userId: updatedUser.id, username: updatedUser.username });
    }

    return NextResponse.json({ 
      user: { id: updatedUser.id, username: updatedUser.username, rating: updatedUser.rapidRating } 
    }, { status: 200 });

  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
