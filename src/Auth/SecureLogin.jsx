import { useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Navigate, useNavigate } from "react-router";
import { auth, functions } from "../../Firebase";
import { useMarketingAuth } from "./MarketingAuthContext";
import { getDeviceInfo } from "../Utils/securityDevice";
import logo from "/mlmboo2.ico?url";

const strongPassword = password => password.length >= 8 && password.length <= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
const input = { width: "100%", height: 48, boxSizing: "border-box", border: "1px solid #475569", borderRadius: 12, padding: "0 14px", background: "#0f172a", color: "#e2e8f0", fontSize: 14 };
const messageFor = error => {
  const code = String(error?.code || "");
  if (String(error?.message || "").includes("Incorrect OTP")) return "OTP सही नहीं है।";
  if (code.includes("resource-exhausted")) return "बहुत अधिक प्रयास हुए। कुछ समय बाद दोबारा प्रयास करें।";
  if (code.includes("permission-denied")) return "इस email पर active Marketing account नहीं मिला। Admin से login email verify कराएं।";
  return String(error?.message || "Login पूरा नहीं हुआ।").replace(/^Firebase(?:Error)?:?\s*/i, "").replace(/functions\/[a-z-]+\)?\.?/gi, "").trim();
};

export function SecureLogin() {
  const navigate = useNavigate();
  const { loading: checking, session, unlocked, unlock, markUnlocked } = useMarketingAuth();
  const [email, setEmail] = useState(""), [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState(""), [challengeId, setChallengeId] = useState(""), [ticket, setTicket] = useState("");
  const [actors, setActors] = useState([]), [actor, setActor] = useState(null);
  const [password, setPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState("email"), [busy, setBusy] = useState(false), [error, setError] = useState("");

  if (checking) return <Box>Checking session…</Box>;
  if (session && unlocked) return <Navigate to="/mportal" replace />;
  const run = async action => { setBusy(true); setError(""); try { await action(); } catch (caught) { setError(messageFor(caught)); } finally { setBusy(false); } };
  const validatePassword = () => { if (!strongPassword(password)) throw new Error("Password में 8–12 characters, uppercase, lowercase, number और special character जरूरी है।"); };

  if (session) {
    const unlockNow = event => { event.preventDefault(); void run(async () => { validatePassword(); await unlock(password); navigate("/mportal", { replace: true }); }); };
    return <Box title="Session Locked" sub="Refresh के बाद केवल password डालें; OTP दोबारा नहीं चाहिए।"><form onSubmit={unlockNow} style={{ display: "grid", gap: 12 }}><input style={input} type="password" autoComplete="current-password" maxLength={12} value={password} onChange={event => setPassword(event.target.value)} placeholder="Strong password" /><Button busy={busy}>Unlock Panel</Button></form><ErrorMessage>{error}</ErrorMessage></Box>;
  }

  const send = event => {
    event.preventDefault();
    void run(async () => {
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Registered email सही format में डालें।");
      const result = await httpsCallable(functions, "marketingStartTwoFactorOtp")({ email: normalized });
      setChallengeId(result.data.challengeId); setMaskedEmail(result.data.maskedEmail || normalized); setOtp(""); setStep("otp");
    });
  };
  const verify = event => {
    event.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(otp)) throw new Error("6 अंकों का OTP डालें।");
      const result = await httpsCallable(functions, "marketingVerifyTwoFactorOtp")({ challengeId, otp });
      setTicket(result.data.loginTicket); setActors(result.data.actors || []); setStep("actor");
    });
  };
  const enter = event => {
    event.preventDefault();
    void run(async () => {
      validatePassword();
      if (!actor?.passwordConfigured && password !== confirmPassword) throw new Error("दोनों passwords समान होने चाहिए।");
      const result = await httpsCallable(functions, "marketingCreateSessionFromTwoFactor")({ challengeId, loginTicket: ticket, actorId: actor.id, password, device: getDeviceInfo() });
      await signInWithCustomToken(auth, result.data.token); markUnlocked();
      if (result.data.loginAlert) {
        const previous = result.data.loginAlert;
        alert(`Last login: ${new Date(previous.createdAt).toLocaleString()}\n${previous.device?.label || "Unknown device"}\nIP: ${previous.ip || "Unavailable"}\n${previous.location || "Location unavailable"}`);
      }
      navigate("/mportal", { replace: true });
    });
  };

  return (
    <Box title="Marketing Secure Login" sub="OTP केवल Admin-registered email पर आएगा। Mobile OTP बंद है।">
      {step === "email" && <form onSubmit={send} style={{ display: "grid", gap: 12 }}><input style={input} type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Registered email" /><Button busy={busy}>Send Email OTP</Button></form>}
      {step === "otp" && <form onSubmit={verify} style={{ display: "grid", gap: 12 }}><p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>6-digit OTP <b style={{ color: "#c7d2fe" }}>{maskedEmail}</b> पर भेजा गया है।</p><input style={{ ...input, textAlign: "center", letterSpacing: 8 }} inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" /><Button busy={busy}>Verify Email OTP</Button><button type="button" disabled={busy} onClick={() => { setStep("email"); setOtp(""); setChallengeId(""); }} style={{ border: 0, background: "none", color: "#94a3b8", cursor: "pointer" }}>Change email</button></form>}
      {step === "actor" && <div style={{ display: "grid", gap: 10 }}><p style={{ margin: "0 0 4px" }}>किस account में login करना है?</p>{actors.map(item => <button key={item.id} onClick={() => { setActor(item); setPassword(""); setConfirmPassword(""); setStep("password"); }} style={{ ...input, height: "auto", padding: 12, textAlign: "left", cursor: "pointer" }}><b>{item.name}</b><small style={{ display: "block", color: "#94a3b8" }}>{item.actorType === "owner" ? "Marketing Member" : "Portal User"}</small></button>)}</div>}
      {step === "password" && <form onSubmit={enter} style={{ display: "grid", gap: 12 }}><b>{actor?.passwordConfigured ? "Password डालें" : "Strong password बनाएं"}</b><input style={input} type="password" maxLength={12} autoComplete={actor?.passwordConfigured ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="8–12 strong password" />{!actor?.passwordConfigured && <input style={input} type="password" maxLength={12} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm password" />}<Button busy={busy}>{actor?.passwordConfigured ? "Login" : "Set Password & Login"}</Button></form>}
      <ErrorMessage>{error}</ErrorMessage>
    </Box>
  );
}

function Box({ children, title, sub }) {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg,#0f172a,#1e1b4b)" }}><div style={{ width: "100%", maxWidth: 410, background: "#1e293b", border: "1px solid #334155", borderRadius: 24, padding: 28, color: "#e2e8f0", boxShadow: "0 30px 80px #0008" }}><div style={{ textAlign: "center", marginBottom: 22 }}><img src={logo} alt="MLM LIVE" style={{ width: 68, height: 68, borderRadius: 16 }} />{title && <h1 style={{ fontSize: 22, margin: "12px 0 4px" }}>{title}</h1>}{sub && <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>{sub}</p>}</div>{children}</div></div>;
}
function Button({ children, busy }) { return <button disabled={busy} style={{ height: 48, border: 0, borderRadius: 12, background: "#6366f1", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.65 : 1 }}>{busy ? "Please wait…" : children}</button>; }
function ErrorMessage({ children }) { return children ? <p style={{ color: "#fca5a5", textAlign: "center", fontSize: 13, margin: "14px 0 0" }}>{children}</p> : null; }
