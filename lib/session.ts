import { cookies } from "next/headers";
import admin from "@/lib/firebase/admin";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: string;
  accessLevel: string;
}

// Session configuration
const SESSION_COOKIE_NAME = "admin_session_token";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Create a secure session cookie with Firebase custom token
 * Should be called after user is authenticated with Firebase
 */
export async function writeSessionCookie(idToken: string): Promise<SessionUser | null> {
  try {
    // Verify the ID token and get user claims
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Fetch user data from Firestore
    const userDoc = await admin.firestore().collection("adminaccount").doc(uid).get();

    if (!userDoc.exists()) {
      throw new Error("User not found in database");
    }

    const userData = userDoc.data() as any;

    // Create a custom token for server-side session
    const customToken = await admin.auth().createCustomToken(uid);

    // Set secure HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, customToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    // Return user data
    return {
      uid,
      email: userData.email || decodedToken.email || "",
      name: userData.fullName || userData.name || "User",
      role: String(userData.role || "").toLowerCase().trim(),
      accessLevel: userData.accessLevel || "staff",
    };
  } catch (error) {
    console.error("[Session] Error writing session cookie:", error);
    return null;
  }
}

/**
 * Get current session user from cookie
 * Returns user data if session is valid, null otherwise
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const customToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!customToken) {
      return null;
    }

    // Verify the custom token is still valid
    const decodedToken = await admin.auth().verifySessionCookie(customToken, true);
    const uid = decodedToken.uid;

    // Fetch fresh user data from Firestore
    const userDoc = await admin.firestore().collection("adminaccount").doc(uid).get();

    if (!userDoc.exists()) {
      // Clear invalid session
      await clearSession();
      return null;
    }

    const userData = userDoc.data() as any;

    return {
      uid,
      email: userData.email || decodedToken.email || "",
      name: userData.fullName || userData.name || "User",
      role: String(userData.role || "").toLowerCase().trim(),
      accessLevel: userData.accessLevel || "staff",
    };
  } catch (error) {
    console.error("[Session] Error getting session:", error);
    return null;
  }
}

/**
 * Validate that a session cookie exists and is valid
 */
export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const customToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!customToken) {
      return false;
    }

    // Verify the custom token
    await admin.auth().verifySessionCookie(customToken, true);
    return true;
  } catch (error) {
    console.error("[Session] Invalid session:", error);
    return false;
  }
}

/**
 * Clear the session cookie
 */
export async function clearSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error("[Session] Error clearing session:", error);
  }
}

/**
 * Refresh session expiry by updating the cookie
 * Call this periodically to keep active sessions alive
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const session = await getSession();

    if (!session) {
      return false;
    }

    const cookieStore = await cookies();
    const customToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (customToken) {
      // Reset cookie to extend expiry
      cookieStore.set(SESSION_COOKIE_NAME, customToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("[Session] Error refreshing session:", error);
    return false;
  }
}
