import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Secondary Firebase app instance used for isolated user creation in the
// admin register flow. createUserWithEmailAndPassword() on this instance
// will NOT affect the currently logged-in superadmin session.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Use a named app ("secondary") so it doesn't clash with the default instance.
const secondaryApp = getApps().find((a) => a.name === "secondary")
  ?? initializeApp(firebaseConfig, "secondary");

export const secondaryAuth = getAuth(secondaryApp);
export default secondaryApp;