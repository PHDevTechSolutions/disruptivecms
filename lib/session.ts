import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: string;
  accessLevel: string;
  /** RBAC scope list stored at login time — e.g. ["read:products","write:products"] */
  scopeAccess?: string[]; // optional — back-filled in getSession() for pre-RBAC cookies
}

export const SESSION_COOKIE_NAME = "admin_session_token";
// Keep sessions valid until explicit logout.
// Note: Cookies must have some expiry for persistence across browser restarts; set far-future.
const SESSION_MAX_AGE = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years in ms

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION_MAX_AGE / 1000, // seconds
    path: "/",
  };
}

export function setSessionCookieOnResponse(
  res: NextResponse,
  userData: SessionUser,
) {
  res.cookies.set(
    SESSION_COOKIE_NAME,
    JSON.stringify(userData),
    getSessionCookieOptions(),
  );
}

export function clearSessionCookieOnResponse(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE_NAME);
}

/**
 * Write a session by storing user data (no Firebase Admin SDK required)
 * @param userData - User data object
 * @param res - Optional NextResponse (recommended in Route Handlers / production)
 * @returns SessionUser if successful, null otherwise
 */
export async function writeSessionCookie(
  userData: SessionUser,
  res?: NextResponse,
): Promise<SessionUser | null> {
  try {
    // In Route Handlers, prefer writing cookies onto the response so Set-Cookie is guaranteed
    if (res) {
      setSessionCookieOnResponse(res, userData);
      return userData;
    }

    // Fallback: mutate cookies() store (works in Server Actions / some runtimes)
    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE_NAME,
      JSON.stringify(userData),
      getSessionCookieOptions(),
    );

    return userData;
  } catch (error) {
    console.error("[Session] writeSessionCookie error:", error);
    return null;
  }
}

/**
 * Get the current session from cookies
 * @returns SessionUser if valid session exists, null otherwise
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return null;
    }

    // Parse the stored user data
    const userData = JSON.parse(sessionCookie) as SessionUser;

    if (!userData.uid) {
      await clearSession();
      return null;
    }

    // Back-fill scopeAccess for sessions created before this field was added
    if (!Array.isArray(userData.scopeAccess)) {
      const { getScopeAccessForRole } = await import("@/lib/rbac");
      userData.scopeAccess = getScopeAccessForRole(userData.role);
    }

    return userData;
  } catch (error) {
    console.error("[Session] getSession error:", error);
    return null;
  }
}

/**
 * Validate that a session cookie exists and is valid
 * @returns true if valid session exists, false otherwise
 */
export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return false;
    }

    // Try to parse it - if it fails, it's invalid
    const userData = JSON.parse(sessionCookie) as SessionUser;
    return !!userData.uid;
  } catch (error) {
    console.error("[Session] validateSession error:", error);
    return false;
  }
}

/**
 * Refresh the session by updating the cookie expiration
 * @returns true if successful, false otherwise
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return false;
    }

    // Verify cookie is still valid
    const userData = JSON.parse(sessionCookie) as SessionUser;
    if (!userData.uid) {
      return false;
    }

    // Update cookie expiration
    cookieStore.set(
      SESSION_COOKIE_NAME,
      sessionCookie,
      getSessionCookieOptions(),
    );

    return true;
  } catch (error) {
    console.error("[Session] refreshSession error:", error);
    return false;
  }
}

/**
 * Clear the session cookie (logout)
 */
export async function clearSession(res?: NextResponse): Promise<void> {
  try {
    if (res) {
      clearSessionCookieOnResponse(res);
      return;
    }
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error("[Session] clearSession error:", error);
  }
}
