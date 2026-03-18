import { NextRequest, NextResponse } from "next/server";
import { SessionUser, writeSessionCookie } from "@/lib/session";
import { getScopeAccessForRole, getAccessLevelForRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/auth/session
 * Legacy alias for /api/auth/login — kept for backwards compatibility.
 *
 * FIX: Added scopeAccess resolution (was completely missing before).
 * Without this, any login that hit this route would get a session cookie
 * with no scopeAccess field, causing hasAccess() to fall back to
 * getScopeAccessForRole() which uses the role-derived defaults — those
 * are correct but the missing field caused inconsistent behaviour.
 *
 * This route now mirrors /api/auth/login exactly.
 * New code should call /api/auth/login directly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, email, name, role } = body;

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const normalizedRole = String(role).toLowerCase().trim();

    // Resolve scopeAccess from Firestore (same logic as /api/auth/login)
    let resolvedScopeAccess: string[] = getScopeAccessForRole(normalizedRole);

    if (adminDb) {
      try {
        const snap = await adminDb.collection("adminaccount").doc(uid).get();
        if (snap.exists) {
          const data = snap.data()!;
          if (Array.isArray(data.scopeAccess) && data.scopeAccess.length > 0) {
            resolvedScopeAccess = data.scopeAccess as string[];
          }
        }
      } catch (err) {
        console.error("[session] Firestore scopeAccess fetch failed:", err);
      }
    }

    const userData: SessionUser = {
      uid,
      email,
      name: name || "User",
      role: normalizedRole,
      accessLevel: getAccessLevelForRole(normalizedRole),
      scopeAccess: resolvedScopeAccess,
    };

    const res = NextResponse.json({ success: true, user: userData });
    const session = await writeSessionCookie(userData, res);

    if (!session) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 },
      );
    }

    return res;
  } catch (error) {
    console.error("[session] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}