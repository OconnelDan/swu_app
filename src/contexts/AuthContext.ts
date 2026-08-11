import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuthContext(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  }
  return value;
}
