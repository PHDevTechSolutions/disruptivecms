import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";

/**
 * GET /api/auth/user
 * Get the current logged-in user from session
 * Used for user persistence across page reloads
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    console.log("[API] All cookies:", allCookies.map(c => c.name));
    
    const session = await getSession();
    console.log("[API] Session result:", session ? "Found" : "Not found");

    if (!session) {
      console.log("[API] No session, returning 401");
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
