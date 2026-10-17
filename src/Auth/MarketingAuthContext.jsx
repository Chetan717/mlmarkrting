import { createContext, useContext } from "react";
import { clearSession, saveSession } from "../Utils/sessionManager";
import { useVerifiedPanelSession } from "./useVerifiedPanelSession";

const AuthContext = createContext(null);
const buildSession = (user, claims, account) => ({
  uid: user.uid, role: claims.actorType === "owner" ? "member" : "subuser",
  mteamId: claims.mteamId, subUserId: claims.subUserId || null,
  name: claims.name || "Member", mobile: claims.mobile || "",
  parentMobile: claims.parentMobile || "",
  tabs: Array.isArray(claims.tabs) ? claims.tabs : [],
  marketingMemberName: account.name || claims.name || "Member",
  loginEmailMasked: account.loginEmailMasked || "",
  parentMteamId: account.parentMteamId || "", parentName: account.parentName || "",
  commissionPercentage: Number(account.commissionPercentage || 0),
  uplineBonusPercentage: Number(account.uplineBonusPercentage || 0),
  couponCode: account.couponCode || "", referCode: account.referCode || "",
});

export function MarketingAuthProvider({ children }) {
  const value = useVerifiedPanelSession({ panel: "marketing", statusEndpoint: "marketingSessionStatus",
    logoutEndpoint: "marketingPanelLogout", buildSession, save: saveSession, clear: clearSession });
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useMarketingAuth() { return useContext(AuthContext); }
