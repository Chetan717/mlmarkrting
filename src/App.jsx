import { SecureLogin as UnifiedLogin } from "./Auth/SecureLogin";
import { Routes, Route, Navigate } from "react-router";
import MteamProtectedRoute from "./Auth/MteamProtectedRoute";
import MteamPortal from "./Pages/Mteam/MteamPortal";
import SecuritySessions from "./Pages/SecuritySessions";
import CallingProtectedRoute from "./Auth/CallingProtectedRoute";
import CallingSecureLogin from "./Auth/CallingSecureLogin";
import CallingPortal from "./Pages/Calling/CallingPortal";


function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/mportal" replace />} />
      <Route path="/marketing" element={<Navigate to="/mportal" replace />} />

      {/* ── Marketing Team Portal ── */}
      <Route
        path="/mportal"
        element={
          <MteamProtectedRoute>
            <MteamPortal />
          </MteamProtectedRoute>
        }
      />
      <Route path="/security" element={<MteamProtectedRoute><SecuritySessions /></MteamProtectedRoute>} />

      {/* ── Calling Team Portal ── */}
      <Route path="/calling-login" element={<CallingSecureLogin />} />
      <Route path="/calling-portal" element={<CallingProtectedRoute><CallingPortal /></CallingProtectedRoute>} />

      {/* ── Auth routes (no Layout) ── */}
      <Route path="/login"   element={<UnifiedLogin />} />
      <Route path="/mlogin"  element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      <Route path="/forgetpin" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
