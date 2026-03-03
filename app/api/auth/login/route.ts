import { NextRequest, NextResponse } from "next/server";
import { writeSessionCookie, SessionUser } from "@/lib/session";

/**
 * POST /api/auth/login
 * Create a session cookie with user data after successful Firebase authentication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { uid, email, name, role, accessLevel } = body;

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const userData: SessionUser = {
      uid,
      email,
      name: name || "User",
      role: String(role).toLowerCase().trim(),
      accessLevel: accessLevel || "staff",
    };

    const res = NextResponse.json({
      success: true,
      user: userData,
    });

    const session = await writeSessionCookie(userData, res);

    if (!session) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 },
      );
    }

    return res;
  } catch (error) {
    console.error("[API] Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
