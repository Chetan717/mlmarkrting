import { useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Navigate, useNavigate } from "react-router";
import { auth, functions } from "../../Firebase";
import { useCallingAuth } from "./CallingAuthContext";
import { getDeviceInfo } from "../Utils/securityDevice";

const strongPassword = password => password.length >= 8 && password.length <= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
const input = { width: "100%", height: 48, boxSizing: "border-box", border: "1px solid #475569", borderRadius: 12, padding: "0 14px", background: "#0f172a", color: "#e2e8f0", fontSize: 14 };

function messageFor(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "Login पूरा नहीं हुआ।");
  if (message.includes("Incorrect OTP")) return "OTP सही नहीं है।";
  if (code.includes("resource-exhausted")) return "बहुत अधिक प्रयास हुए। कुछ समय बाद दोबारा प्रयास करें।";
  if (code.includes("permission-denied")) return "इस email पर active Calling Team account नहीं मिला। Marketing Member से contact करें।";
  return message.replace(/^Firebase(?:Error)?:?\s*/i, "").replace(/functions\/[a-z-]+\)?\.?/gi, "").trim();
}

export default function CallingSecureLogin() {
  const navigate = useNavigate();
  const { loading: checking, session, unlocked, unlock, markUnlocked } = useCallingAuth();
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [ticket, setTicket] = useState("");
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (checking) return <Box title="Calling Team Login">Checking session…</Box>;
  if (session && unlocked) return <Navigate to="/calling-portal" replace />;

  const run = async (action) => {
    setBusy(true); setError("");
    try { await action(); } catch (caught) { setError(messageFor(caught)); } finally { setBusy(false); }
  };
  const validatePassword = () => {
    if (!strongPassword(password)) throw new Error("Password में 8–12 characters, uppercase, lowercase, number और special character जरूरी है।");
  };

  if (session) {
    const unlockNow = event => {
      event.preventDefault();
      void run(async () => {
        validatePassword();
        await unlock(password);
        navigate("/calling-portal", { replace: true });
      });
    };
    return <Box title="Calling Team Session Locked" sub="Refresh के बाद केवल password डालें; OTP दोबारा नहीं चाहिए।">
      <form onSubmit={unlockNow} style={{ display: "grid", gap: 12 }}>
        <input style={input} type="password" autoComplete="current-password" maxLength={12} value={password} onChange={event => setPassword(event.target.value)} placeholder="Strong password" />
        <Button busy={busy}>Unlock Panel</Button>
      </form>
      <ErrorMessage>{error}</ErrorMessage>
    </Box>;
  }

  const send = event => {
    event.preventDefault();
    void run(async () => {
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Registered email सही format में डालें।");
      const result = await httpsCallable(functions, "callingStartTwoFactorOtp")({ email: normalized });
      setChallengeId(result.data.challengeId);
      setMaskedEmail(result.data.maskedEmail || normalized);
      setOtp("");
      setStep("otp");
    });
  };

  const verify = event => {
    event.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(otp)) throw new Error("6 अंकों का OTP डालें।");
      const result = await httpsCallable(functions, "callingVerifyTwoFactorOtp")({ challengeId, otp });
      setTicket(result.data.loginTicket);
      setAccount(result.data.account || null);
      setStep("password");
    });
  };

  const enter = event => {
    event.preventDefault();
    void run(async () => {
      validatePassword();
      if (!account?.passwordConfigured && password !== confirmPassword) throw new Error("दोनों passwords समान होने चाहिए।");
      const result = await httpsCallable(functions, "callingCreateSessionFromTwoFactor")({ challengeId, loginTicket: ticket, password, device: getDeviceInfo() });
      await signInWithCustomToken(auth, result.data.token);
      markUnlocked();
      if (result.data.loginAlert) {
        const previous = result.data.loginAlert;
        alert(`Last login: ${new Date(previous.createdAt).toLocaleString()}\n${previous.device?.label || "Unknown device"}\nIP: ${previous.ip || "Unavailable"}\n${previous.location || "Location unavailable"}`);
      }
      navigate("/calling-portal", { replace: true });
    });
  };

  return <Box title="Calling Team Secure Login" sub="Marketing Member द्वारा registered email पर OTP आएगा।">
    {step === "email" && <form onSubmit={send} style={{ display: "grid", gap: 12 }}>
      <input style={input} type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Registered email" />
      <Button busy={busy}>Send Email OTP</Button>
      <a href="/login" style={{ color: "#a5b4fc", fontSize: 12, textAlign: "center" }}>Marketing Member Login</a>
    </form>}
    {step === "otp" && <form onSubmit={verify} style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>6-digit OTP <b style={{ color: "#c7d2fe" }}>{maskedEmail}</b> पर भेजा गया है।</p>
      <input style={{ ...input, textAlign: "center", letterSpacing: 8 }} inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" />
      <Button busy={busy}>Verify Email OTP</Button>
      <button type="button" disabled={busy} onClick={() => { setStep("email"); setOtp(""); setChallengeId(""); }} style={{ border: 0, background: "none", color: "#94a3b8", cursor: "pointer" }}>Change email</button>
    </form>}
    {step === "password" && <form onSubmit={enter} style={{ display: "grid", gap: 12 }}>
      <div style={{ padding: 12, borderRadius: 12, background: "#0f172a", border: "1px solid #334155" }}>
        <b>{account?.name || "Calling Member"}</b>
        <small style={{ display: "block", color: "#94a3b8", marginTop: 3 }}>Tracking Code: {account?.code || "—"}</small>
      </div>
      <b>{account?.passwordConfigured ? "Password डालें" : "Strong password बनाएं"}</b>
      <input style={input} type="password" maxLength={12} autoComplete={account?.passwordConfigured ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–12 strong password" />
      {!account?.passwordConfigured && <input style={input} type="password" maxLength={12} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm password" />}
      <Button busy={busy}>{account?.passwordConfigured ? "Login" : "Set Password & Login"}</Button>
    </form>}
    <ErrorMessage>{error}</ErrorMessage>
  </Box>;
}

function Box({ children, title, sub }) {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg,#07111f,#1e1b4b)" }}>
    <div style={{ width: "100%", maxWidth: 420, background: "#1e293b", border: "1px solid #334155", borderRadius: 24, padding: 28, color: "#e2e8f0", boxShadow: "0 30px 80px #0008" }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 24, marginBottom: 18 }}>☎</div>
      <h1 style={{ margin: 0, fontSize: 24 }}>{title || "Calling Team"}</h1>
      {sub && <p style={{ color: "#94a3b8", margin: "8px 0 20px", lineHeight: 1.5, fontSize: 13 }}>{sub}</p>}
      {children}
    </div>
  </div>;
}

function Button({ children, busy }) {
  return <button disabled={busy} style={{ height: 48, border: 0, borderRadius: 12, background: busy ? "#4338ca80" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "Please wait…" : children}</button>;
}

function ErrorMessage({ children }) {
  return children ? <p style={{ margin: "14px 0 0", padding: 10, borderRadius: 10, background: "#ef444415", border: "1px solid #ef444440", color: "#fca5a5", fontSize: 12 }}>{children}</p> : null;
}
