import { NextRequest, NextResponse } from "next/server";
import { writeSessionCookie } from "@/lib/session";

/**
 * POST /api/auth/session
 * Create a session cookie after user authentication
 * Expects Firebase ID token in request body
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: "Missing idToken" },
        { status: 400 }
      );
    }

    // Write the session cookie
    const user = await writeSessionCookie(idToken);

    if (!user) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 401 }
      );
    }

    // Return user data
    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("[API] Session creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
