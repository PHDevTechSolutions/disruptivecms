import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCNonSOohWCFdgL052XUFFZTH1orbP2dH4",
  authDomain: "taskflow-4605f.firebaseapp.com",
  projectId: "taskflow-4605f",
  storageBucket: "taskflow-4605f.firebasestorage.app",
  messagingSenderId: "558742255762",
  appId: "1:558742255762:web:5725b5c26f1c6fae9e8e4b",
  measurementId: "G-9J1LXQ8YZC",
};

// Secondary Firebase app instance for isolated user creation
// This prevents createUserWithEmailAndPassword() from affecting the primary session
let secondaryApp: any = null;

try {
  secondaryApp = getApp("secondary");
} catch (err) {
  // App doesn't exist yet, initialize it
  secondaryApp = initializeApp(firebaseConfig, "secondary");
}

export const secondaryAuth = getAuth(secondaryApp);
export default secondaryApp;
