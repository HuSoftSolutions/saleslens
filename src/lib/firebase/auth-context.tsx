"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth } from "./client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Helper to get the current user's ID token for API calls.
 * Pass forceRefresh=true to pick up newly-minted custom claims (e.g. platformAdmin).
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getClientAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/**
 * Reads the platformAdmin custom claim from the current ID token.
 * Pass forceRefresh=true to bypass the cached token after a claim change.
 */
export async function getPlatformAdminClaim(
  forceRefresh = false
): Promise<boolean> {
  const user = getClientAuth().currentUser;
  if (!user) return false;
  const result = await user.getIdTokenResult(forceRefresh);
  return result.claims.platformAdmin === true;
}
