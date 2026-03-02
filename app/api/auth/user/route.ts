import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/user
 * Get the current logged-in user from session
 * Used for user persistence across page reloads
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: session,
    });
  } catch (error) {
    console.error("[API] Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
