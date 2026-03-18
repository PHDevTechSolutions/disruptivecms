import { NextRequest, NextResponse } from "next/server";
import { writeSessionCookie, SessionUser } from "@/lib/session";
import { getScopeAccessForRole } from "@/lib/rbac";

/**
 * POST /api/auth/login
 * Create a session cookie with user data after successful Firebase authentication.
 *
 * RBAC: Accepts an optional `scopeAccess` array from the client (read from
 * Firestore during login).  If not supplied, it is derived from the role so
 * that older clients still work correctly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { uid, email, name, role, accessLevel, scopeAccess } = body;

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const normalizedRole = String(role).toLowerCase().trim();

    // Resolve scopeAccess: trust what the client sends (from Firestore); fall
    // back to deriving from role for backwards compatibility.
    const resolvedScopeAccess: string[] =
      Array.isArray(scopeAccess) && scopeAccess.length > 0
        ? scopeAccess
        : getScopeAccessForRole(normalizedRole);

    const userData: SessionUser = {
      uid,
      email,
      name: name || "User",
      role: normalizedRole,
      accessLevel: accessLevel || "staff",
      scopeAccess: resolvedScopeAccess,
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
      { status: 500 },
    );
  }
}
