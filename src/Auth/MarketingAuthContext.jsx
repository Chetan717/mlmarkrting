import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { auth, functions } from "../../Firebase";
import { httpsCallable } from "firebase/functions";
import { clearSession, saveSession } from "../Utils/sessionManager";

const AuthContext = createContext(null);
export function MarketingAuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => onIdTokenChanged(auth, async (user) => {
    if (!user) { clearSession(); setSession(null); setUnlocked(false); setLoading(false); return; }
    try {
    const token = await user.getIdTokenResult();
    if (token.claims.panel !== "marketing") throw new Error("wrong panel");
    await httpsCallable(functions, "marketingSessionStatus")({});
    const next = {
      uid: user.uid, role: token.claims.actorType === "owner" ? "member" : "subuser",
      mteamId: token.claims.mteamId, subUserId: token.claims.subUserId || null,
      name: token.claims.name || "Member", mobile: token.claims.mobile || "",
      parentMobile: token.claims.parentMobile || "",
      tabs: Array.isArray(token.claims.tabs) ? token.claims.tabs : [],
    };
    saveSession(next); setSession(next); setLoading(false);
    } catch (_) { clearSession(); setSession(null); setUnlocked(false); await signOut(auth).catch(()=>null); setLoading(false); }
  }), []);
  const value = useMemo(() => ({ loading, session, unlocked, markUnlocked:()=>setUnlocked(true), unlock:async password=>{await httpsCallable(functions,"marketingUnlockSession")({password});setUnlocked(true);}, logout: async () => {
    await httpsCallable(functions, "marketingPanelLogout")({}).catch(() => null);
    clearSession(); await signOut(auth); setSession(null); setUnlocked(false);
  }}), [loading, session, unlocked]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useMarketingAuth() { return useContext(AuthContext); }
