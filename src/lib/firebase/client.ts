import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getApp_(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getClientAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getApp_());
    setPersistence(_auth, browserLocalPersistence);
  }
  return _auth;
}

export function getClientDb(): Firestore {
  if (!_db) _db = getFirestore(getApp_());
  return _db;
}

// Convenience aliases — only use from client components
export const auth = typeof window !== "undefined" ? getClientAuth() : (null as unknown as Auth);
export const db = typeof window !== "undefined" ? getClientDb() : (null as unknown as Firestore);
