import { NextRequest, NextResponse } from "next/server";
import { trackUser, getOnlineCount } from "@/lib/online-tracking";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Try to get user's session token or IP to use as a unique ID
    let identifier = req.cookies.get("session_token")?.value;
    
    if (!identifier) {
      // Fallback to IP address if no session token
      const forwardedFor = req.headers.get("x-forwarded-for");
      if (forwardedFor) {
        identifier = forwardedFor.split(',')[0].trim();
      } else {
        identifier = req.headers.get("x-real-ip") || "anonymous-" + Math.random().toString();
      }
    }

    trackUser(identifier);
    
    // Return at least 1 since the user themselves is online
    const count = Math.max(1, getOnlineCount());
    
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json({ count: 1 });
  }
}
