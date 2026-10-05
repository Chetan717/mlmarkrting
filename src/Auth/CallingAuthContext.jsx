import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../Firebase";
import { clearCallingSession, saveCallingSession } from "../Utils/callingSessionManager";

const CallingAuthContext = createContext(null);

export function CallingAuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => onIdTokenChanged(auth, async (user) => {
    if (!user) {
      clearCallingSession();
      setSession(null);
      setUnlocked(false);
      setLoading(false);
      return;
    }
    try {
      const token = await user.getIdTokenResult();
      if (token.claims.panel !== "calling") {
        clearCallingSession();
        setSession(null);
        setUnlocked(false);
        setLoading(false);
        return;
      }
      const result = await httpsCallable(functions, "callingSessionStatus")({});
      const account = result.data?.account || {};
      const next = {
        uid: user.uid,
        role: "calling",
        callingMemberId: token.claims.callingMemberId || account.id,
        mteamId: token.claims.mteamId || account.mteamId,
        name: account.name || token.claims.name || "Calling Member",
        mobile: account.mobile || token.claims.mobile || "",
        emailMasked: account.emailMasked || "",
        callingCode: account.callingCode || token.claims.callingCode || "",
        marketingMemberName: account.marketingMemberName || "Marketing Member",
      };
      saveCallingSession(next);
      setSession(next);
      setLoading(false);
    } catch (_) {
      clearCallingSession();
      setSession(null);
      setUnlocked(false);
      await signOut(auth).catch(() => null);
      setLoading(false);
    }
  }), []);

  const value = useMemo(() => ({
    loading,
    session,
    unlocked,
    markUnlocked: () => setUnlocked(true),
    unlock: async (password) => {
      await httpsCallable(functions, "callingUnlockSession")({ password });
      setUnlocked(true);
    },
    logout: async () => {
      await httpsCallable(functions, "callingPanelLogout")({}).catch(() => null);
      clearCallingSession();
      await signOut(auth);
      setSession(null);
      setUnlocked(false);
    },
  }), [loading, session, unlocked]);

  return <CallingAuthContext.Provider value={value}>{children}</CallingAuthContext.Provider>;
}

export function useCallingAuth() {
  return useContext(CallingAuthContext);
}
