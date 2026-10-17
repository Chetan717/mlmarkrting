import { useEffect, useId, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../Firebase";
import { normalizeCustomerMobile } from "../Utils/customerMobile";

const labels = {
  name: "Name", fullName: "Full Name", userName: "User Name", mobile: "Mobile", mobileNo: "Mobile Number",
  email: "Email", companyName: "Company Name", company_name: "Company Name", CompanyName: "Company Name",
  company: "Company", mlmCompanyName: "MLM Company", isverified: "Verified", isActive: "Active",
  createdAt: "Registered On", updatedAt: "Updated On", lastDownloadAt: "Last Download",
  dob: "Date of Birth", dateOfBirth: "Date of Birth", distributorId: "Distributor ID", distributorID: "Distributor ID",
  memberId: "Member ID", memberID: "Member ID", mlmId: "MLM ID", companyId: "Company ID", companyID: "Company ID",
};
const labelFor = key => labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, value => value.toUpperCase());
const display = (key, value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (["createdAt", "updatedAt", "lastDownloadAt"].includes(key) && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
  return String(value);
};

function Details({ title, values }) {
  const rows = Object.entries(values || {}).filter(([, value]) => ["string", "boolean", "number"].includes(typeof value));
  return <section className="customer-search-card"><h3>{title}</h3><dl>
    {!rows.some(([key]) => key === "companyName") && <div><dt>Company Name</dt><dd>—</dd></div>}
    {rows.map(([key, value]) => <div key={key}><dt>{labelFor(key)}</dt><dd>{display(key, value)}</dd></div>)}
  </dl></section>;
}

export default function CustomerSearch({ dark = false }) {
  const inputId = useId();
  const request = useRef(0);
  const [mobile, setMobile] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { request.current += 1; }, []);

  const search = async event => {
    event.preventDefault();
    const current = ++request.current;
    setResult(null); setError("");
    const normalized = normalizeCustomerMobile(mobile);
    if (!normalized) { setLoading(false); setError("Valid 10-digit mobile number daalein. +91 aur spaces use kar sakte hain."); return; }
    setLoading(true);
    try {
      const response = await httpsCallable(functions, "panelCustomerSearch")({ mobile: normalized });
      if (current === request.current) setResult(response.data);
    } catch (caught) {
      if (current !== request.current) return;
      const code = String(caught?.code || "");
      setError(code.includes("permission-denied") ? "Customer Search ki permission nahi hai. Marketing owner se contact karein."
        : code.includes("unauthenticated") ? "Session expire ho gaya hai. Dobara login karein."
        : code.includes("resource-exhausted") ? "Bahut saare searches hue hain. Ek minute baad try karein."
        : "Customer search nahi ho paya. Connection check karke dobara try karein.");
    } finally { if (current === request.current) setLoading(false); }
  };

  return <div className="customer-search" style={dark ? { "--p-card": "#111827", "--p-card2": "#0f172a", "--p-text": "#e2e8f0", "--p-text-3": "#94a3b8", "--p-border": "#334155" } : undefined}>
    <h2>Customer Search</h2><p className="customer-search-hint">MLM LIVE par registered customer ko mobile number se khojein.</p>
    <form onSubmit={search} className="customer-search-form" aria-busy={loading}>
      <label htmlFor={inputId}>Mobile Number<input id={inputId} type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder="Mobile number / +91" value={mobile} onChange={event => {
        request.current += 1; setMobile(event.target.value); setResult(null); setError(""); setLoading(false);
      }} /></label>
      <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
    </form>
    {loading && <p role="status">Customer search ho raha hai…</p>}
    {error && <p className="customer-search-error" role="alert">{error}</p>}
    {result?.found === false && <p className="customer-search-notice" role="status">Is mobile number par customer registered nahi hai.</p>}
    {result?.found === true && <div aria-live="polite">
      <p className="customer-search-success">Customer registered hai · Read-only details</p>
      <Details title="Customer Details" values={result.customer} />
      <h3>MLM Profiles</h3>
      {result.mlmProfiles?.length ? result.mlmProfiles.map((profile, index) => <Details key={index} title={`MLM Profile ${index + 1}`} values={profile} />)
        : <p className="customer-search-notice">Is customer ka MLM profile available nahi hai.</p>}
      {result.profilesTruncated && <p className="customer-search-notice">Pehle 30 matching profiles dikhaye gaye hain.</p>}
    </div>}
    <style>{`
      .customer-search{max-width:1040px;margin:0 auto;padding:24px clamp(14px,3vw,30px);color:var(--p-text,#e2e8f0)}
      .customer-search h2{margin:0 0 8px;font-size:25px}.customer-search-hint{color:var(--p-text-3,#94a3b8);margin:0 0 24px;font-size:14px}
      .customer-search-form{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:20px;border:1px solid var(--p-border,#334155);border-radius:16px;background:var(--p-card,#111827)}
      .customer-search-form label{display:grid;gap:8px;font-size:13px;font-weight:700;flex:1;min-width:180px}
      .customer-search-form input{box-sizing:border-box;width:100%;height:46px;padding:0 13px;border:1px solid var(--p-border,#334155);border-radius:10px;background:var(--p-card2,#0f172a);color:inherit;font-size:16px}
      .customer-search-form button{height:46px;padding:0 24px;border:0;border-radius:10px;background:#6366f1;color:white;font-weight:700;cursor:pointer}.customer-search-form button:disabled{opacity:.65;cursor:wait}
      .customer-search-error{color:#ef4444;padding:14px;border:1px solid #ef444444;border-radius:12px}.customer-search-notice{padding:16px;background:var(--p-card2,#0f172a);border-radius:12px;color:var(--p-text-3,#94a3b8)}.customer-search-success{color:#10b981;font-weight:700;margin-top:24px}
      .customer-search-card{margin:16px 0;padding:20px;border:1px solid var(--p-border,#334155);background:var(--p-card,#111827);border-radius:16px}.customer-search-card h3{margin:0 0 16px;font-size:16px}
      .customer-search-card dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:18px;margin:0}.customer-search-card dt{font-size:12px;color:var(--p-text-3,#94a3b8);margin-bottom:5px}.customer-search-card dd{margin:0;font-size:14px;overflow-wrap:anywhere}
    `}</style>
  </div>;
}
