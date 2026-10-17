import { createContext, useContext } from "react";
import { clearCallingSession, saveCallingSession } from "../Utils/callingSessionManager";
import { useVerifiedPanelSession } from "./useVerifiedPanelSession";

const CallingAuthContext = createContext(null);
const buildSession = (user, claims, account) => ({
  uid: user.uid, role: "calling",
  callingMemberId: claims.callingMemberId || account.id,
  mteamId: claims.mteamId || account.mteamId,
  name: account.name || claims.name || "Calling Member",
  mobile: account.mobile || claims.mobile || "", emailMasked: account.emailMasked || "",
  callingCode: account.callingCode || claims.callingCode || "",
  marketingMemberName: account.marketingMemberName || "Marketing Member",
});

export function CallingAuthProvider({ children }) {
  const value = useVerifiedPanelSession({ panel: "calling", statusEndpoint: "callingSessionStatus",
    logoutEndpoint: "callingPanelLogout", buildSession, save: saveCallingSession, clear: clearCallingSession });
  return <CallingAuthContext.Provider value={value}>{children}</CallingAuthContext.Provider>;
}
export function useCallingAuth() { return useContext(CallingAuthContext); }
