import { Navigate } from "react-router";
import { useMarketingAuth } from "./MarketingAuthContext";

export default function MteamProtectedRoute({ children }) {
  const { loading, session, unlocked } = useMarketingAuth();
  if (loading) return <div style={{minHeight:"100vh",display:"grid",placeItems:"center"}}>Checking session…</div>;
  return session && unlocked ? children : <Navigate to="/login" replace />;
}
