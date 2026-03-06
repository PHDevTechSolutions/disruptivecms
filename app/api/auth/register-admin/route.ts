import { NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

/**
 * POST /api/auth/register-admin
 * Create a new admin account WITHOUT logging out the current superadmin user
 * This is an internal API for superadmin account creation only
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { email, password, fullName, role, provider = "password" } = body;

    if (!email || !fullName || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, fullName, role" },
        { status: 400 }
      );
    }

    if (provider === "password" && !password) {
      return NextResponse.json(
        { error: "Password is required for password-based registration" },
        { status: 400 }
      );
    }

    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    let user;
    let uid: string;

    // Create user in Firebase (will auto sign in - we'll handle this carefully)
    if (provider === "password") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      user = cred.user;
      uid = user.uid;

      // Update profile
      await updateProfile(user, { displayName: fullName });
    } else if (provider === "google") {
      // Google provider registration is handled client-side
      return NextResponse.json(
        {
          error: "Google provider registration must be handled client-side",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    // Check if user already exists in Firestore
    const ref = doc(db, "adminaccount", uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return NextResponse.json(
        { error: "User already exists in the system" },
        { status: 409 }
      );
    }

    // Create admin account record in Firestore
    await setDoc(ref, {
      uid,
      email,
      fullName,
      role,
      accessLevel: role === "admin" || role === "superadmin" ? "full" : "staff",
      status: "active",
      website: "disruptivesolutionsinc",
      provider,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });

    // Return success WITHOUT calling signOut
    // The client must handle maintaining the superadmin session
    return NextResponse.json({
      success: true,
      user: {
        uid,
        email,
        fullName,
        role,
      },
    });
  } catch (error: any) {
    console.error("[API] Admin registration error:", error);

    // Handle specific Firebase errors
    if (error?.code === "auth/email-already-in-use") {
      return NextResponse.json(
        { error: "Email is already registered" },
        { status: 409 }
      );
    }

    if (error?.code === "auth/weak-password") {
      return NextResponse.json(
        { error: "Password is too weak" },
        { status: 400 }
      );
    }

    if (error?.code === "auth/invalid-email") {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
