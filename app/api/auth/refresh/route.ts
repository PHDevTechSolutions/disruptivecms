import { NextRequest, NextResponse } from "next/server";
import { getSession, setSessionCookieOnResponse } from "@/lib/session";

/**
 * POST /api/auth/refresh
 * Refresh the current session to extend its expiry
 * Used to keep active sessions alive
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      success: true,
      user: session,
      message: "Session refreshed",
    });

    // Re-set cookie on response to extend expiry reliably in production
    setSessionCookieOnResponse(res, session);

    return res;
  } catch (error) {
    console.error("[API] Refresh session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
