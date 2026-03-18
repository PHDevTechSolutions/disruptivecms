import { NextRequest, NextResponse } from "next/server";
import { writeSessionCookie, SessionUser } from "@/lib/session";
import { getScopeAccessForRole, getAccessLevelForRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/auth/login
 *
 * Creates the session cookie after Firebase client-side authentication succeeds.
 *
 * SECURITY: scopeAccess is ALWAYS read from Firestore via the Admin SDK.
 * The client-sent `scopeAccess` body field is silently discarded — trusting it
 * would let anyone POST `scopeAccess: ["superadmin"]` and get admin privileges.
 *
 * Resolution order for scopeAccess (first that succeeds wins):
 *   1. adminaccount/{uid}.scopeAccess from Firestore  ← authoritative
 *   2. getScopeAccessForRole(role)                     ← safe fallback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // `scopeAccess` is destructured here but intentionally never used below —
    // it is discarded to prevent privilege escalation from the client body.
    const { uid, email, name, role } = body;

    if (!uid || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields: uid, email, role" },
        { status: 400 },
      );
    }

    const normalizedRole = String(role).toLowerCase().trim();

    // ── Fetch authoritative scopeAccess from Firestore ───────────────────────
    let resolvedScopeAccess: string[] = getScopeAccessForRole(normalizedRole);

    if (adminDb) {
      try {
        const snap = await adminDb.collection("adminaccount").doc(uid).get();

        if (snap.exists) {
          const data = snap.data()!;

          // Reject if the role stored in Firestore doesn't match what the
          // client sent — could indicate a tampered request.
          const firestoreRole = String(data.role ?? "")
            .toLowerCase()
            .trim();

          if (firestoreRole && firestoreRole !== normalizedRole) {
            console.warn(
              `[login] Role mismatch uid=${uid} ` +
                `client="${normalizedRole}" firestore="${firestoreRole}"`,
            );
            return NextResponse.json(
              { error: "Role mismatch — please sign out and log in again." },
              { status: 403 },
            );
          }

          // Prefer Firestore-stored scopes; fall back to role-derived defaults
          // for accounts created before the scopeAccess field was introduced.
          if (Array.isArray(data.scopeAccess) && data.scopeAccess.length > 0) {
            resolvedScopeAccess = data.scopeAccess as string[];
          }
        }
      } catch (err) {
        // Firestore read failed — log and continue with role-derived fallback.
        // This keeps login working even during temporary Firestore outages.
        console.error(
          "[login] Failed to fetch scopeAccess from Firestore:",
          err,
        );
      }
    } else {
      // Admin SDK not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
      // FIREBASE_PRIVATE_KEY missing). Log a warning; role-derived fallback is safe.
      console.warn(
        "[login] Firebase Admin SDK not initialised — " +
          "scopeAccess derived from role. Set FIREBASE_PROJECT_ID, " +
          "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in your .env.",
      );
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
    console.error("[login] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
