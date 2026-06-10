import { headers } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

export interface AuthenticatedUser {
  uid: string;
  email: string | undefined;
  /**
   * Platform-level super-admin. Sourced from the `platformAdmin` custom claim,
   * which is signed into the ID token and cannot be forged client-side.
   * Grants account/lifecycle management of the SalesLens platform — NOT access
   * to any business's sales, analytics, or chat data.
   */
  platformAdmin: boolean;
}

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Use this in all API route handlers to authenticate requests.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const headersList = await headers();
  const authorization = headersList.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authorization.slice(7);

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      platformAdmin: decoded.platformAdmin === true,
    };
  } catch {
    return null;
  }
}
