import { Navigate } from "react-router";
import { useCallingAuth } from "./CallingAuthContext";

export default function CallingProtectedRoute({ children }) {
  const { loading, session, unlocked } = useCallingAuth();
  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Checking Calling Team session…</div>;
  return session && unlocked ? children : <Navigate to="/calling-login" replace />;
}
