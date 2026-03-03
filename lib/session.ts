import { cookies } from "next/headers";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: string;
  accessLevel: string;
}

const SESSION_COOKIE_NAME = "admin_session_token";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/**
 * Write a session by storing user data (no Firebase Admin SDK required)
 * @param userData - User data object
 * @returns SessionUser if successful, null otherwise
 */
export async function writeSessionCookie(
  userData: SessionUser
): Promise<SessionUser | null> {
  try {
    // Store the user data in a secure HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(userData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE / 1000, // in seconds
      path: "/",
    });

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
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE / 1000,
      path: "/",
    });

    return true;
  } catch (error) {
    console.error("[Session] refreshSession error:", error);
    return false;
  }
}

/**
 * Clear the session cookie (logout)
 */
export async function clearSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error("[Session] clearSession error:", error);
  }
}
