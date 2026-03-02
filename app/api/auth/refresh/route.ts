import { NextRequest, NextResponse } from "next/server";
import { refreshSession, getSession } from "@/lib/session";

/**
 * POST /api/auth/refresh
 * Refresh the current session to extend its expiry
 * Used to keep active sessions alive
 */
export async function POST(request: NextRequest) {
  try {
    const refreshed = await refreshSession();

    if (!refreshed) {
      return NextResponse.json(
        { error: "Failed to refresh session" },
        { status: 401 }
      );
    }

    // Get updated user data
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: session,
      message: "Session refreshed",
    });
  } catch (error) {
    console.error("[API] Refresh session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
