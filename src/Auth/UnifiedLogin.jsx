import { useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Navigate, useNavigate } from "react-router";
import { auth, functions } from "../../Firebase";
import { useMarketingAuth } from "./MarketingAuthContext";
import logo from "/mlmboo2.ico?url";

const messageFor = (error) => {
  const code = error?.code || "";
  if (error?.message?.includes("Incorrect OTP")) return "OTP सही नहीं है।";
  if (code.includes("invalid-verification-code")) return "OTP सही नहीं है।";
  if (code.includes("too-many-requests") || code.includes("resource-exhausted")) return "बहुत अधिक प्रयास हुए। कुछ समय बाद प्रयास करें।";
  if (code.includes("permission-denied")) return "यह नंबर Marketing panel के लिए अधिकृत नहीं है।";
  return error?.message?.replace(/Firebase/gi,"Service") || "Login पूरा नहीं हुआ।";
};

export function UnifiedLogin() {
  const navigate = useNavigate(); const { session } = useMarketingAuth();
  const [mobile,setMobile]=useState(""); const [otp,setOtp]=useState("");
  const [challengeId,setChallengeId]=useState(""); const [loginTicket,setLoginTicket]=useState("");
  const [step,setStep]=useState("mobile"); const [actors,setActors]=useState([]);
  const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  if (session) return <Navigate to="/mportal" replace/>;
  const send=async(e)=>{e.preventDefault();setError("");if(!/^\d{10}$/.test(mobile))return setError("10 अंकों का सही mobile number डालें।");setLoading(true);try{const r=await httpsCallable(functions,"marketingStartTwoFactorOtp")({panel:"marketing",mobile});setChallengeId(r.data.challengeId);setStep("otp");}catch(x){setError(messageFor(x));}finally{setLoading(false);}};
  const verify=async(e)=>{e.preventDefault();setError("");if(!/^\d{4}$/.test(otp))return setError("4 अंकों का OTP डालें।");setLoading(true);try{const r=await httpsCallable(functions,"marketingVerifyTwoFactorOtp")({panel:"marketing",challengeId,otp});setLoginTicket(r.data.loginTicket);setActors(r.data.actors||[]);setStep("actor");}catch(x){setError(messageFor(x));}finally{setLoading(false);}};
  const enter=async(actorId)=>{setLoading(true);setError("");try{const r=await httpsCallable(functions,"marketingCreateSessionFromTwoFactor")({panel:"marketing",challengeId,loginTicket,actorId});await signInWithCustomToken(auth,r.data.token);navigate("/mportal",{replace:true});}catch(x){setError(messageFor(x));}finally{setLoading(false);}};
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"linear-gradient(135deg,#0f172a,#1e1b4b)"}}><div style={{width:"100%",maxWidth:390,background:"#1e293b",border:"1px solid #334155",borderRadius:24,padding:28,color:"#e2e8f0",boxShadow:"0 30px 80px #0008"}}>
    <div style={{textAlign:"center",marginBottom:24}}><img src={logo} alt="MLM Live" style={{width:80,height:80,borderRadius:18}}/><h1 style={{fontSize:22,margin:"12px 0 4px"}}>Marketing Secure Login</h1><p style={{fontSize:13,color:"#94a3b8"}}>Marketing owner OTP से अपना या sub-user portal खोलें</p></div>
    {step==="mobile"&&<form onSubmit={send} style={{display:"grid",gap:14}}><input autoComplete="tel" inputMode="numeric" value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Marketing owner mobile" style={input}/><button disabled={loading} style={button}>{loading?"Sending…":"Send OTP"}</button></form>}
    {step==="otp"&&<form onSubmit={verify} style={{display:"grid",gap:14}}><input autoComplete="one-time-code" inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="4-digit OTP" style={{...input,textAlign:"center",letterSpacing:8}}/><button disabled={loading} style={button}>{loading?"Verifying…":"Verify OTP"}</button><button type="button" onClick={()=>{setStep("mobile");setOtp("");setChallengeId("");}} style={{background:"none",border:0,color:"#94a3b8"}}>Change number</button></form>}
    {step==="actor"&&<div style={{display:"grid",gap:10}}><p>किस account में प्रवेश करना है?</p>{actors.map(a=><button key={a.id} disabled={loading} onClick={()=>enter(a.id)} style={{...input,textAlign:"left",height:"auto",cursor:"pointer"}}><b style={{display:"block"}}>{a.name}</b><small style={{color:"#94a3b8"}}>{a.actorType==="owner"?"Marketing Member":"Sub-user"}</small></button>)}</div>}
    {error&&<p style={{color:"#fca5a5",fontSize:13,textAlign:"center",marginTop:14}}>{error}</p>}
  </div></div>;
}
const input={width:"100%",height:48,boxSizing:"border-box",border:"1px solid #475569",borderRadius:12,padding:"0 14px",background:"#0f172a",color:"#e2e8f0",fontSize:14};
const button={height:48,border:0,borderRadius:12,background:"#6366f1",color:"white",fontWeight:700,cursor:"pointer"};
