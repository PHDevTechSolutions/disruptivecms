import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

/**
 * POST /api/auth/logout
 * Clear the session cookie and logout user
 */
export async function POST(request: NextRequest) {
  try {
    const res = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    // Clear the session cookie on the response (guarantees Set-Cookie on Vercel/prod)
    await clearSession(res);

    return res;
  } catch (error) {
    console.error("[API] Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
