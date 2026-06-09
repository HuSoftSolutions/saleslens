import {
  initializeApp,
  getApps,
  cert,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // In production, set FIREBASE_SERVICE_ACCOUNT_KEY to the FULL service-account
  // JSON object. Locally, leave it unset to use Application Default Credentials
  // (gcloud auth application-default login). A malformed value falls back to ADC
  // instead of crashing every request.
  let serviceAccount: ServiceAccount | undefined;
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawKey && rawKey.trim()) {
    try {
      serviceAccount = JSON.parse(rawKey) as ServiceAccount;
    } catch {
      console.warn(
        "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON (expected the full service-account JSON object, not just the private key). Falling back to Application Default Credentials."
      );
    }
  }

  return initializeApp(
    serviceAccount
      ? {
          credential: cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        }
      : {
          projectId: process.env.FIREBASE_PROJECT_ID,
        }
  );
}

const app = getAdminApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
