import PanelSessionLoading from "./PanelSessionLoading";
import { Navigate } from "react-router";
import { useCallingAuth } from "./CallingAuthContext";

export default function CallingProtectedRoute({ children }) {
  const { loading, session, unlocked, error, retry } = useCallingAuth();
  if (loading) return <PanelSessionLoading error={error} retry={retry} />;
  return session && unlocked ? children : <Navigate to="/calling-login" replace />;
}
