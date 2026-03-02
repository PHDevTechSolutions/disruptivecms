import admin from "@/lib/firebase/admin";
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

export async function writeSessionCookie(
  idToken: string
): Promise<SessionUser | null> {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await admin
      .firestore()
      .collection("adminaccount")
      .doc(uid)
      .get();

    if (!userDoc.exists) throw new Error("User not found");

    const userData = userDoc.data() as any;

    const sessionCookie = await admin
      .auth()
      .createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE });

    const cookieStore = await cookies(); // ✅ await here
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE / 1000, // in seconds
      path: "/",
    });

    return {
      uid,
      email: userData.email || decodedToken.email || "",
      name: userData.fullName || userData.name || "User",
      role: String(userData.role || "").toLowerCase().trim(),
      accessLevel: userData.accessLevel || "staff",
    };
  } catch (error) {
    console.error("[Session] writeSessionCookie error:", error);
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies(); // ✅ await here
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    const decodedToken = await admin.auth().verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    const userDoc = await admin.firestore().collection("adminaccount").doc(uid).get();
    if (!userDoc.exists) {
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
    console.error("[Session] getSession error:", error);
    return null;
  }
}

export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies(); // ✅ await here
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return false;

    await admin.auth().verifySessionCookie(sessionCookie, true);
    return true;
  } catch (error) {
    console.error("[Session] validateSession error:", error);
    return false;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const cookieStore = await cookies(); // ✅ await here
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error("[Session] clearSession error:", error);
  }
}

export async function refreshSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies(); // ✅ await here
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return false;

    await admin.auth().verifySessionCookie(sessionCookie, true);

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