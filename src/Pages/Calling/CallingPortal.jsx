import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../Firebase";
import { useCallingAuth } from "../../Auth/CallingAuthContext";

const PAGE_SIZE = 15;
const APP_LINK = "https://play.google.com/store/apps/details?id=com.mlmbooster.mlmbooster";
const STATUSES = ["New", "Contacted", "Follow Up", "Interested", "Converted", "Lost", "Renewal Follow Up"];
const dateText = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const errorText = error => String(error?.message || "Something went wrong.").replace(/^Firebase(?:Error)?:?\s*/i, "").replace(/functions\/[a-z-]+\)?\.?/gi, "").trim();

function Badge({ children, tone = "blue" }) {
  const tones = { blue: ["#818cf8", "#6366f122"], green: ["#34d399", "#10b98120"], red: ["#f87171", "#ef444420"], gray: ["#94a3b8", "#64748b20"], amber: ["#fbbf24", "#f59e0b20"] };
  const [color, background] = tones[tone] || tones.blue;
  return <span style={{ padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, color, background }}>{children}</span>;
}
function Stat({ label, value }) { return <div style={s.stat}><strong>{value}</strong><span>{label}</span></div>; }

export default function CallingPortal() {
  const { session, logout } = useCallingAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", planStatus: "all", leadStatus: "all", profile: "all", company: "all", expiringIn: "all", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [followup, setFollowup] = useState(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Follow Up");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);

  const shareMyCode = () => {
    const code = session?.callingCode || "";
    if (!code) return;
    const referralLink = `${APP_LINK}&referrer=${encodeURIComponent(`ref=${code}`)}`;
    const message = `MLMLIVE पर मेरे Calling Team Code ${code} से join करें.\n\nDownload: ${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const fetchData = async () => {
    setLoading(true); setError("");
    try {
      const result = await httpsCallable(functions, "callingGetDashboard")({});
      setData(result.data || null); setPage(1);
    } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };

  const saveFollowup = async event => {
    event.preventDefault(); if (!followup) return;
    setSaving(true); setError("");
    try {
      const result = await httpsCallable(functions, "callingSaveFollowup")({ userId: followup.id, leadStatus: status, note, nextFollowupDate: nextDate });
      const patch = result.data || {};
      setData(prev => ({ ...prev, leads: (prev?.leads || []).map(lead => lead.id === followup.id ? { ...lead, leadStatus: patch.leadStatus, nextFollowupDate: patch.nextFollowupDate, lastNote: patch.lastNote, lastFollowupAt: Date.now() } : lead) }));
      setFollowup(null); setNote(""); setNextDate(""); setStatus("Follow Up");
    } catch (e) { setError(errorText(e)); } finally { setSaving(false); }
  };

  const companies = useMemo(() => [...new Set((data?.leads || []).map(lead => lead.companyName).filter(Boolean))].sort(), [data]);
  const filtered = useMemo(() => (data?.leads || []).filter(lead => {
    const q = filters.search.trim().toLowerCase();
    if (q && ![lead.name, lead.mobile, lead.companyName].some(value => String(value || "").toLowerCase().includes(q))) return false;
    if (filters.planStatus !== "all" && lead.planStatus !== filters.planStatus) return false;
    if (filters.leadStatus !== "all" && lead.leadStatus !== filters.leadStatus) return false;
    if (filters.profile === "yes" && !lead.hasMlmProfile) return false;
    if (filters.profile === "no" && lead.hasMlmProfile) return false;
    if (filters.company !== "all" && lead.companyName !== filters.company) return false;
    if (filters.expiringIn !== "all") {
      const days = Number.isFinite(lead.daysLeft) ? lead.daysLeft : null;
      if (days === null) return false;
      if (filters.expiringIn === "today" && days !== 0) return false;
      if (["1", "2", "3"].includes(filters.expiringIn) && days !== Number(filters.expiringIn)) return false;
      if (filters.expiringIn === "7" && (days < 0 || days > 7)) return false;
      if (filters.expiringIn === "15" && (days < 0 || days > 15)) return false;
    }
    if (filters.from && (!lead.joinedAt || lead.joinedAt < new Date(`${filters.from}T00:00:00`).getTime())) return false;
    if (filters.to && (!lead.joinedAt || lead.joinedAt > new Date(`${filters.to}T23:59:59`).getTime())) return false;
    return true;
  }), [data, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <div style={s.page}><style>{`.calling-data-table th,.calling-data-table td{padding:11px 12px;border-bottom:1px solid #1f2937;text-align:left;font-size:12px;vertical-align:top}.calling-data-table th{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;background:#0f172a;position:sticky;top:0}.calling-data-table tr:last-child td{border-bottom:0}`}</style>
    <header style={s.header}><div><div style={s.brand}>MLMLIVE · Calling Team</div><h1 style={{ margin: "3px 0 0" }}>{session?.name}</h1><p style={s.muted}>Marketing Member: {session?.marketingMemberName} · Tracking Code: <b style={{ color: "#a5b4fc" }}>{session?.callingCode}</b></p></div><div style={s.actions}><Badge tone="gray">Commission ₹0 · Tracking Only</Badge><button style={s.smallBtn} onClick={shareMyCode}>Share My Code</button><button style={s.btn} onClick={fetchData} disabled={loading}>{loading ? "Loading…" : data ? "Refresh" : "Fetch My Users"}</button><button style={s.dangerBtn} onClick={logout}>Logout</button></div></header>

    {error && <div style={s.error}>{error}</div>}
    {!data && !loading && <div style={s.empty}><div style={{ fontSize: 36 }}>☎</div><h3>My Calling Leads</h3><p style={s.muted}>आपके Calling Code से track हुए users देखने के लिए “Fetch My Users” दबाएँ। Data on-demand रखा गया है ताकि unnecessary reads न हों।</p></div>}

    {data && <>
      <section style={s.stats}><Stat label="Total Users" value={data.summary?.totalUsers || 0} /><Stat label="Today" value={data.summary?.todayUsers || 0} /><Stat label="This Month" value={data.summary?.monthUsers || 0} /><Stat label="Active Plan" value={data.summary?.activePlan || 0} /><Stat label="No Plan" value={data.summary?.noPlan || 0} /><Stat label="Expired" value={data.summary?.expired || 0} /><Stat label="MLM Profile" value={data.summary?.hasProfile || 0} /><Stat label="No Profile" value={data.summary?.noProfile || 0} /><Stat label="Expiring ≤ 7 Days" value={data.summary?.expiring7 || 0} /></section>
      <section style={s.card}>
        <div style={s.filters}><input style={s.input} placeholder="Search name / mobile / company" value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} /><select style={s.input} value={filters.planStatus} onChange={e => { setFilters({ ...filters, planStatus: e.target.value }); setPage(1); }}><option value="all">All Plan Status</option><option>Active</option><option>No Plan</option><option>Expired</option><option>Inactive</option></select><select style={s.input} value={filters.leadStatus} onChange={e => { setFilters({ ...filters, leadStatus: e.target.value }); setPage(1); }}><option value="all">All Lead Status</option>{STATUSES.map(v => <option key={v}>{v}</option>)}</select><select style={s.input} value={filters.profile} onChange={e => { setFilters({ ...filters, profile: e.target.value }); setPage(1); }}><option value="all">All Profiles</option><option value="yes">MLM Profile Yes</option><option value="no">MLM Profile No</option></select><select style={s.input} value={filters.company} onChange={e => { setFilters({ ...filters, company: e.target.value }); setPage(1); }}><option value="all">All Companies</option>{companies.map(v => <option key={v}>{v}</option>)}</select><select style={s.input} value={filters.expiringIn} onChange={e => { setFilters({ ...filters, expiringIn: e.target.value }); setPage(1); }}><option value="all">Expiring: All</option><option value="today">Today</option><option value="1">In 1 Day</option><option value="2">In 2 Days</option><option value="3">In 3 Days</option><option value="7">Within 7 Days</option><option value="15">Within 15 Days</option></select><input style={s.input} type="date" value={filters.from} onChange={e => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /><input style={s.input} type="date" value={filters.to} onChange={e => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></div>
        <div style={s.tableWrap}><table className="calling-data-table" style={s.table}><thead><tr><th>User</th><th>Joined</th><th>Company</th><th>Plan</th><th>Expiry</th><th>Lead</th><th>Last Download</th><th>Actions</th></tr></thead><tbody>
          {visible.map(lead => <tr key={lead.id}><td><b>{lead.name}</b><div style={s.muted}>{lead.mobile}</div></td><td>{dateText(lead.joinedAt)}</td><td>{lead.companyName || "—"}<div style={s.muted}>{lead.hasMlmProfile ? "MLM Profile Yes" : "No Profile"}</div></td><td><Badge tone={lead.planStatus === "Active" ? "green" : lead.planStatus === "Expired" ? "red" : "gray"}>{lead.planStatus}</Badge><div style={s.muted}>{lead.plan || "—"}</div></td><td>{lead.expiryDate || "—"}<div style={s.muted}>{Number.isFinite(lead.daysLeft) ? `${lead.daysLeft} days` : ""}</div></td><td><b>{lead.leadStatus || "New"}</b>{lead.nextFollowupDate && <div style={s.muted}>Next: {lead.nextFollowupDate}</div>}{lead.lastNote && <div style={{ ...s.muted, maxWidth: 220 }}>{lead.lastNote}</div>}</td><td>{dateText(lead.lastDownloadAt)}</td><td><div style={s.actions}><a style={s.link} href={`tel:${lead.mobile}`}>Call</a><a style={s.link} target="_blank" rel="noreferrer" href={`https://wa.me/91${lead.mobile}`}>WhatsApp</a><button style={s.smallBtn} onClick={() => { setFollowup(lead); setStatus(lead.leadStatus || "Follow Up"); setNextDate(lead.nextFollowupDate || ""); setNote(""); }}>Follow-up</button></div></td></tr>)}
          {visible.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No users match these filters.</td></tr>}
        </tbody></table></div>
        <div style={s.pager}><span>{filtered.length} users</span><div style={s.actions}><button style={s.smallBtn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button><span>{page} / {pages}</span><button style={s.smallBtn} disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next</button></div></div>
      </section>
    </>}

    {followup && <div style={s.modal}><div style={s.overlay} onClick={() => setFollowup(null)} /><form onSubmit={saveFollowup} style={s.modalCard}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><h3 style={{ margin: 0 }}>Follow-up · {followup.name}</h3><p style={s.muted}>{followup.mobile}</p></div><button type="button" style={s.close} onClick={() => setFollowup(null)}>✕</button></div><label style={s.field}>Lead Status<select style={s.input} value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(v => <option key={v}>{v}</option>)}</select></label><label style={s.field}>Follow-up Note<textarea required rows={4} maxLength={500} style={{ ...s.input, paddingTop: 10, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Call discussion / next action" /></label><label style={s.field}>Next Follow-up Date<input style={s.input} type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} /></label><button style={s.btn} disabled={saving || !note.trim()}>{saving ? "Saving…" : "Save Follow-up"}</button></form></div>}
  </div>;
}

const s = {
  page: { minHeight: "100vh", background: "#0b1120", color: "#e2e8f0", padding: "24px clamp(14px,3vw,34px)", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", maxWidth: 1500, margin: "0 auto 18px" }, brand: { fontSize: 12, fontWeight: 900, color: "#818cf8", letterSpacing: ".08em" }, muted: { margin: "4px 0 0", color: "#94a3b8", fontSize: 11 },
  actions: { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }, btn: { border: 0, borderRadius: 10, padding: "10px 14px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 800, cursor: "pointer" }, dangerBtn: { border: "1px solid #ef444455", borderRadius: 10, padding: "9px 13px", background: "#ef444415", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }, smallBtn: { border: "1px solid #334155", borderRadius: 8, padding: "6px 9px", background: "#111827", color: "#e2e8f0", fontWeight: 700, cursor: "pointer", fontSize: 11 }, link: { textDecoration: "none", border: "1px solid #334155", borderRadius: 8, padding: "6px 9px", color: "#a5b4fc", fontWeight: 800, fontSize: 11 },
  error: { maxWidth: 1500, margin: "0 auto 14px", padding: 12, borderRadius: 10, background: "#ef444415", border: "1px solid #ef444440", color: "#fca5a5" }, empty: { maxWidth: 1500, margin: "0 auto", padding: 50, textAlign: "center", border: "1px dashed #334155", borderRadius: 18, background: "#111827" },
  stats: { maxWidth: 1500, margin: "0 auto 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }, stat: { background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 3 },
  card: { maxWidth: 1500, margin: "0 auto", background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: 14 }, filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }, input: { width: "100%", minHeight: 40, boxSizing: "border-box", borderRadius: 9, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", padding: "8px 10px", outline: "none" }, tableWrap: { overflowX: "auto", border: "1px solid #1f2937", borderRadius: 12 }, table: { width: "100%", minWidth: 950, borderCollapse: "collapse" }, pager: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, color: "#94a3b8", fontSize: 12 },
  modal: { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 18 }, overlay: { position: "absolute", inset: 0, background: "#000b", backdropFilter: "blur(4px)" }, modalCard: { position: "relative", zIndex: 1, width: "100%", maxWidth: 480, background: "#111827", border: "1px solid #334155", borderRadius: 18, padding: 20, display: "grid", gap: 14 }, close: { border: 0, background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 18 }, field: { display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#cbd5e1" },
};
