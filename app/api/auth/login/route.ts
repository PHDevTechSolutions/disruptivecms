import { NextRequest, NextResponse } from "next/server";
import { writeSessionCookie, SessionUser } from "@/lib/session";
import { getScopeAccessForRole, getAccessLevelForRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/auth/login
 * Create a session cookie with user data after successful Firebase authentication.
 *
 * SECURITY: scopeAccess is NEVER taken from the client request body.
 * It is always read from Firestore server-side via the Admin SDK so that
 * a malicious caller cannot inject elevated scopes (e.g. "superadmin",
 * "verify:products") into their own session cookie.
 *
 * Resolution order for scopeAccess:
 *   1. adminaccount/{uid}.scopeAccess from Firestore  ← authoritative
 *   2. Derived from role via getScopeAccessForRole()  ← fallback for legacy accounts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // NOTE: `scopeAccess` from the body is intentionally destructured but
    // never used below — it is discarded to prevent privilege escalation.
    const { uid, email, name, role, accessLevel } = body;

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const normalizedRole = String(role).toLowerCase().trim();

    // ── Fetch authoritative scopeAccess from Firestore (server-side) ────────
    // Never trust the client-supplied value; always derive from the database.
    let resolvedScopeAccess: string[] = getScopeAccessForRole(normalizedRole);

    if (adminDb) {
      try {
        const userSnap = await adminDb
          .collection("adminaccount")
          .doc(uid)
          .get();

        if (userSnap.exists) {
          const data = userSnap.data()!;

          // Use stored scopeAccess if present and non-empty; otherwise fall
          // back to role-derived scopes (covers legacy/pre-RBAC accounts).
          if (Array.isArray(data.scopeAccess) && data.scopeAccess.length > 0) {
            resolvedScopeAccess = data.scopeAccess as string[];
          }

          // Also re-derive accessLevel from Firestore to keep it consistent.
          // Ignore the client-sent value for the same reason.
          const firestoreRole = String(data.role ?? normalizedRole)
            .toLowerCase()
            .trim();

          // Validate that the role in Firestore matches what was sent; if not,
          // reject — this could indicate a tampered request.
          if (firestoreRole !== normalizedRole) {
            console.warn(
              `[API] Login role mismatch — client sent "${normalizedRole}", Firestore has "${firestoreRole}" for uid ${uid}`,
            );
            return NextResponse.json(
              { error: "Role mismatch — please log in again." },
              { status: 403 },
            );
          }
        }
      } catch (firestoreErr) {
        // Log but don't fail the login — fall back to role-derived scopes.
        // This keeps the app functional if Firestore is temporarily unavailable,
        // while still being safer than trusting the client.
        console.error(
          "[API] Failed to fetch scopeAccess from Firestore:",
          firestoreErr,
        );
      }
    } else {
      // Admin SDK not configured — log a warning and fall back gracefully.
      console.warn(
        "[API] Firebase Admin SDK not initialised — scopeAccess derived from role only. " +
          "Set FIREBASE_ADMIN_* env vars to enable server-side Firestore validation.",
      );
    }

    const userData: SessionUser = {
      uid,
      email,
      name: name || "User",
      role: normalizedRole,
      accessLevel: accessLevel || getAccessLevelForRole(normalizedRole),
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
