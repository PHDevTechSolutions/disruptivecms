import admin from "firebase-admin";

// Only initialise once — Next.js hot-reload can call this module multiple times.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      // These three match the exact key names in your .env file.
      // The old code looked for FIREBASE_ADMIN_PROJECT_ID etc. which don't exist,
      // so adminDb was always null and the Admin SDK was never actually running.
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env stores the PEM with literal \n sequences — replace them so
      // the private key is valid when parsed by the SDK.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL:
      "https://taskflow-4605f-default-rtdb.asia-southeast1.firebasedatabase.app",
  });
}

// Firestore via Admin SDK — used server-side in API routes for RBAC validation.
// Will be null only if the three env vars above are missing entirely.
export const adminDb = admin.apps.length ? admin.firestore() : null;

export default admin;