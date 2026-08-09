import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username } = body;
    
    if (!username || username.length < 2) {
      return NextResponse.json(
        { error: "Username must be at least 2 characters" },
        { status: 400 }
      );
    }
    
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    
    if (existing) {
      return NextResponse.json({ user: existing });
    }
    
    const [newUser] = await db
      .insert(users)
      .values({ username })
      .returning();
    
    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    
    if (username) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      
      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ user });
    }
    
    const userList = await db
      .select()
      .from(users)
      .orderBy(users.createdAt)
      .limit(50);
    
    return NextResponse.json({ users: userList });
  } catch (error) {
    console.error("Error getting users:", error);
    return NextResponse.json(
      { error: "Failed to get users" },
      { status: 500 }
    );
  }
}
