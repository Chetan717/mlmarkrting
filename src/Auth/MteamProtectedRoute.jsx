import PanelSessionLoading from "./PanelSessionLoading";
import { Navigate } from "react-router";
import { useMarketingAuth } from "./MarketingAuthContext";

export default function MteamProtectedRoute({ children }) {
  const { loading, session, unlocked, error, retry } = useMarketingAuth();
  if (loading) return <PanelSessionLoading error={error} retry={retry} />;
  return session && unlocked ? children : <Navigate to="/login" replace />;
}
