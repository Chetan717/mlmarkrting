import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../Firebase";

const PAGE_SIZE = 15;
const emptyForm = { name: "", mobile: "", email: "", code: "" };

const normalizeCode = value => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
const formatDate = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function errorText(error) {
  return String(error?.message || "Something went wrong.").replace(/^Firebase(?:Error)?:?\s*/i, "").replace(/functions\/[a-z-]+\)?\.?/gi, "").trim();
}

function Stat({ label, value, hint }) {
  return <div style={s.stat}><div style={s.statValue}>{value}</div><div style={s.statLabel}>{label}</div>{hint && <div style={s.hint}>{hint}</div>}</div>;
}

function Badge({ children, tone = "blue" }) {
  const tones = {
    blue: ["#6366f1", "#6366f115"], green: ["#10b981", "#10b98115"], red: ["#ef4444", "#ef444415"], amber: ["#f59e0b", "#f59e0b15"], gray: ["#64748b", "#64748b15"],
  };
  const [color, background] = tones[tone] || tones.blue;
  return <span style={{ padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, color, background, whiteSpace: "nowrap" }}>{children}</span>;
}

export default function CallingTeamManagement() {
  const [members, setMembers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", planStatus: "all", leadStatus: "all", profile: "all", company: "all", expiringIn: "all", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");

  const loadMembers = async () => {
    setLoading(true); setError("");
    try {
      const result = await httpsCallable(functions, "marketingListCallingTeam")({});
      setMembers(result.data?.members || []);
      setLoaded(true);
    } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); };
  const openEdit = member => { setEditing(member); setForm({ name: member.name || "", mobile: member.mobile || "", email: member.email || "", code: member.code || "" }); setFormOpen(true); };
  const generateCode = () => {
    const base = (form.name || "CALL").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "CALL";
    setForm(prev => ({ ...prev, code: normalizeCode(`${base}${Math.floor(100 + Math.random() * 900)}`) }));
  };

  const saveMember = async event => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, code: normalizeCode(form.code) };
      if (editing) await httpsCallable(functions, "marketingUpdateCallingMember")({ memberId: editing.id, ...payload });
      else await httpsCallable(functions, "marketingCreateCallingMember")(payload);
      setFormOpen(false); setEditing(null); setForm(emptyForm); await loadMembers();
    } catch (e) { setError(errorText(e)); } finally { setSaving(false); }
  };

  const toggleActive = async member => {
    setError("");
    try {
      await httpsCallable(functions, "marketingSetCallingMemberActive")({ memberId: member.id, active: !member.active });
      setMembers(prev => prev.map(item => item.id === member.id ? { ...item, active: !item.active } : item));
    } catch (e) { setError(errorText(e)); }
  };

  const resetPassword = async member => {
    if (!window.confirm(`${member.name} का Calling Panel password reset करें? Existing login sessions बंद हो जाएंगे।`)) return;
    setError("");
    try {
      await httpsCallable(functions, "marketingResetCallingMemberPassword")({ memberId: member.id });
      alert("Password reset हो गया। अगली OTP login पर नया password set होगा।");
    } catch (e) { setError(errorText(e)); }
  };

  const viewAnalysis = async member => {
    setAnalysisLoading(true); setError(""); setPage(1);
    try {
      const result = await httpsCallable(functions, "marketingGetCallingMemberAnalysis")({ memberId: member.id });
      setAnalysis(result.data || null);
      setFilters({ search: "", planStatus: "all", leadStatus: "all", profile: "all", company: "all", expiringIn: "all", from: "", to: "" });
    } catch (e) { setError(errorText(e)); } finally { setAnalysisLoading(false); }
  };

  const copyCallingLoginLink = async () => {
    const link = `${window.location.origin}/calling-login`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setToast("Calling Login Link Copied");
    } catch {
      setToast("Link copy नहीं हुआ");
    }
    window.setTimeout(() => setToast(""), 2200);
  };

  const companies = useMemo(() => [...new Set((analysis?.leads || []).map(lead => lead.companyName).filter(Boolean))].sort(), [analysis]);
  const leadStatuses = useMemo(() => [...new Set((analysis?.leads || []).map(lead => lead.leadStatus).filter(Boolean))].sort(), [analysis]);
  const filtered = useMemo(() => {
    return (analysis?.leads || []).filter(lead => {
      const q = filters.search.trim().toLowerCase();
      if (q && ![lead.name, lead.mobile, lead.companyName, lead.callingTeamCode].some(value => String(value || "").toLowerCase().includes(q))) return false;
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
    });
  }, [analysis, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <div style={s.root}><style>{`.calling-data-table th,.calling-data-table td{padding:11px 12px;border-bottom:1px solid var(--p-border);text-align:left;font-size:12px;vertical-align:top}.calling-data-table th{font-size:11px;color:var(--p-text-4);text-transform:uppercase;letter-spacing:.04em;background:var(--p-card2);position:sticky;top:0}.calling-data-table tr:last-child td{border-bottom:0}`}</style>
    <div style={s.header}>
      <div><h2 style={s.title}>My Calling Team</h2><p style={s.sub}>Calling members, tracking codes और member-wise user analysis. Calling codes पर commission हमेशा ₹0 है।</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={s.secondaryBtn} onClick={copyCallingLoginLink}>Copy Calling Login Link</button>
        <button style={s.secondaryBtn} disabled={loading} onClick={loadMembers}>{loading ? "Loading…" : loaded ? "Refresh Team" : "Fetch Team"}</button>
        <button style={s.primaryBtn} onClick={openAdd}>+ Add Calling Member</button>
      </div>
    </div>

    {toast && <div role="status" aria-live="polite" style={s.toast}>✓ {toast}</div>}

    {error && <div style={s.error}>{error}</div>}

    {formOpen && <form onSubmit={saveMember} style={s.formCard}>
      <div style={s.formHead}><div><h3 style={{ margin: 0 }}>{editing ? "Edit Calling Member" : "Add Calling Member"}</h3><p style={s.hint}>Email OTP + strong password से separate panel login होगा।</p></div><button type="button" style={s.iconBtn} onClick={() => setFormOpen(false)}>✕</button></div>
      <div style={s.grid4}>
        <label style={s.field}><span>Full Name</span><input required minLength={2} style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rahul Kumar" /></label>
        <label style={s.field}><span>Mobile</span><input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} style={s.input} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digit mobile" /></label>
        <label style={s.field}><span>Login Email</span><input required type="email" style={s.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value.toLowerCase() })} placeholder="caller@example.com" /></label>
        <label style={s.field}><span>Tracking Code</span><div style={{ display: "flex", gap: 6 }}><input required minLength={4} maxLength={12} style={{ ...s.input, flex: 1 }} value={form.code} onChange={e => setForm({ ...form, code: normalizeCode(e.target.value) })} placeholder="CALL123" /><button type="button" onClick={generateCode} style={s.smallBtn}>Auto</button></div></label>
      </div>
      <div style={s.notice}><b>Important:</b> यह code केवल Calling Team attribution के लिए है। User ownership Main Marketing Member के पास रहेगा और commission main coupon/referral code से ही calculate होगा।</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" style={s.secondaryBtn} onClick={() => setFormOpen(false)}>Cancel</button><button style={s.primaryBtn} disabled={saving}>{saving ? "Saving…" : editing ? "Update Member" : "Create Member"}</button></div>
    </form>}

    {!loaded && !loading && <div style={s.empty}><div style={{ fontSize: 34 }}>☎</div><b>Calling Team data on-demand है</b><p style={s.hint}>ऊपर “Fetch Team” दबाएँ। इससे page खोलते ही unnecessary Firestore reads नहीं होंगे।</p></div>}

    {loaded && <>
      <div style={s.statsRow}>
        <Stat label="Calling Members" value={members.length} />
        <Stat label="Active" value={members.filter(m => m.active).length} />
        <Stat label="Tracked Users" value={members.reduce((sum, m) => sum + Number(m.totalUsers || 0), 0)} hint="No caller commission" />
        <Stat label="This Month" value={members.reduce((sum, m) => sum + Number(m.monthUsers || 0), 0)} />
      </div>
      <div style={s.tableWrap}><table className="calling-data-table" style={s.table}><thead><tr><th>Member</th><th>Tracking Code</th><th>Users</th><th>Today</th><th>This Month</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {members.length === 0 ? <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--p-text-4)" }}>No Calling Team members yet.</td></tr> : members.map(member => <tr key={member.id}>
          <td><b>{member.name}</b><div style={s.muted}>{member.mobile}</div><div style={s.muted}>{member.email}</div></td>
          <td><Badge>{member.code}</Badge><div style={{ marginTop: 5 }}><Badge tone="gray">Commission ₹0</Badge></div></td>
          <td><b>{member.totalUsers || 0}</b></td><td>{member.todayUsers || 0}</td><td>{member.monthUsers || 0}</td>
          <td><Badge tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Inactive"}</Badge></td>
          <td><div style={s.actions}><button style={s.smallBtn} onClick={() => viewAnalysis(member)}>Analysis</button><button style={s.smallBtn} onClick={() => openEdit(member)}>Edit</button><button style={s.smallBtn} onClick={() => resetPassword(member)}>Reset Pass</button><button style={{ ...s.smallBtn, color: member.active ? "#ef4444" : "#10b981" }} onClick={() => toggleActive(member)}>{member.active ? "Disable" : "Enable"}</button></div></td>
        </tr>)}
      </tbody></table></div>
    </>}

    {analysisLoading && <div style={s.empty}>Loading detailed Calling Team analysis…</div>}
    {analysis && !analysisLoading && <div style={s.analysisCard}>
      <div style={s.formHead}><div><h3 style={{ margin: 0 }}>{analysis.member?.name} — Calling Analysis</h3><p style={s.hint}>Code: <b>{analysis.member?.code}</b> · Main ownership: Marketing Member · Calling Code commission: ₹0</p></div><button style={s.iconBtn} onClick={() => setAnalysis(null)}>✕</button></div>
      <div style={s.statsRow}>
        <Stat label="Total Users" value={analysis.summary?.totalUsers || 0} />
        <Stat label="Today" value={analysis.summary?.todayUsers || 0} />
        <Stat label="This Month" value={analysis.summary?.monthUsers || 0} />
        <Stat label="Active Plan" value={analysis.summary?.activePlan || 0} />
        <Stat label="No Plan" value={analysis.summary?.noPlan || 0} />
        <Stat label="Expired" value={analysis.summary?.expired || 0} />
        <Stat label="MLM Profile" value={analysis.summary?.hasProfile || 0} />
        <Stat label="No Profile" value={analysis.summary?.noProfile || 0} />
        <Stat label="Expiring ≤ 7 Days" value={analysis.summary?.expiring7 || 0} />
      </div>
      <div style={s.filters}>
        <input style={s.input} placeholder="Search name / mobile / company" value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} />
        <select style={s.input} value={filters.planStatus} onChange={e => { setFilters({ ...filters, planStatus: e.target.value }); setPage(1); }}><option value="all">All Plan Status</option><option>Active</option><option>No Plan</option><option>Expired</option><option>Inactive</option></select>
        <select style={s.input} value={filters.leadStatus} onChange={e => { setFilters({ ...filters, leadStatus: e.target.value }); setPage(1); }}><option value="all">All Lead Status</option>{leadStatuses.map(v => <option key={v}>{v}</option>)}</select>
        <select style={s.input} value={filters.profile} onChange={e => { setFilters({ ...filters, profile: e.target.value }); setPage(1); }}><option value="all">All Profiles</option><option value="yes">MLM Profile Yes</option><option value="no">MLM Profile No</option></select>
        <select style={s.input} value={filters.company} onChange={e => { setFilters({ ...filters, company: e.target.value }); setPage(1); }}><option value="all">All Companies</option>{companies.map(v => <option key={v}>{v}</option>)}</select>
        <select style={s.input} value={filters.expiringIn} onChange={e => { setFilters({ ...filters, expiringIn: e.target.value }); setPage(1); }}><option value="all">Expiring: All</option><option value="today">Today</option><option value="1">In 1 Day</option><option value="2">In 2 Days</option><option value="3">In 3 Days</option><option value="7">Within 7 Days</option><option value="15">Within 15 Days</option></select>
        <input style={s.input} type="date" value={filters.from} onChange={e => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} title="From date" />
        <input style={s.input} type="date" value={filters.to} onChange={e => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} title="To date" />
      </div>
      <div style={{ ...s.tableWrap, marginTop: 12 }}><table className="calling-data-table" style={s.table}><thead><tr><th>User</th><th>Joined</th><th>Company</th><th>Plan</th><th>Expiry</th><th>Lead Status</th><th>Last Download</th><th>Contact</th></tr></thead><tbody>
        {visible.map(lead => <tr key={lead.id}><td><b>{lead.name}</b><div style={s.muted}>{lead.mobile}</div></td><td>{formatDate(lead.joinedAt)}</td><td>{lead.companyName || "—"}<div style={s.muted}>{lead.hasMlmProfile ? "Profile Yes" : "No Profile"}</div></td><td><Badge tone={lead.planStatus === "Active" ? "green" : lead.planStatus === "Expired" ? "red" : "gray"}>{lead.planStatus}</Badge><div style={s.muted}>{lead.plan || "—"}</div></td><td>{lead.expiryDate || "—"}<div style={s.muted}>{Number.isFinite(lead.daysLeft) ? `${lead.daysLeft} days` : ""}</div></td><td>{lead.leadStatus || "New"}<div style={s.muted}>{lead.nextFollowupDate || ""}</div></td><td>{formatDate(lead.lastDownloadAt)}</td><td><div style={s.actions}><a style={s.linkBtn} href={`tel:${lead.mobile}`}>Call</a><a style={s.linkBtn} href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noreferrer">WhatsApp</a></div></td></tr>)}
        {visible.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "var(--p-text-4)" }}>No users match these filters.</td></tr>}
      </tbody></table></div>
      <div style={s.pager}><span>{filtered.length} users</span><div style={{ display: "flex", gap: 6 }}><button style={s.smallBtn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button><span style={{ padding: "7px 10px" }}>{page} / {pageCount}</span><button style={s.smallBtn} disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</button></div></div>
    </div>}
  </div>;
}

const s = {
  root: { display: "flex", flexDirection: "column", gap: 18, color: "var(--p-text)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" },
  title: { margin: 0, fontSize: 24, fontWeight: 800 }, sub: { margin: "5px 0 0", color: "var(--p-text-3)", fontSize: 13, maxWidth: 760 },
  primaryBtn: { border: 0, borderRadius: 10, padding: "10px 14px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 800, cursor: "pointer" },
  secondaryBtn: { border: "1px solid var(--p-border)", borderRadius: 10, padding: "9px 13px", background: "var(--p-card)", color: "var(--p-text)", fontWeight: 700, cursor: "pointer" },
  smallBtn: { border: "1px solid var(--p-border)", borderRadius: 8, padding: "6px 9px", background: "var(--p-card2)", color: "var(--p-text)", fontWeight: 700, cursor: "pointer", fontSize: 11 },
  iconBtn: { border: 0, background: "transparent", color: "var(--p-text-3)", cursor: "pointer", fontSize: 18 },
  linkBtn: { textDecoration: "none", border: "1px solid var(--p-border)", borderRadius: 8, padding: "6px 8px", color: "#6366f1", fontSize: 11, fontWeight: 800 },
  formCard: { background: "var(--p-card)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 18, boxShadow: "var(--p-shadow)" },
  formHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--p-text-3)" },
  input: { width: "100%", minHeight: 40, boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--p-border)", background: "var(--p-card2)", color: "var(--p-text)", outline: "none" },
  notice: { margin: "14px 0", padding: 12, background: "#f59e0b12", border: "1px solid #f59e0b35", borderRadius: 10, color: "var(--p-text-2)", fontSize: 12, lineHeight: 1.5 },
  toast: { position: "fixed", top: 18, right: 18, zIndex: 9999, padding: "11px 14px", borderRadius: 10, background: "#0f172a", border: "1px solid #10b98170", color: "#d1fae5", boxShadow: "0 14px 36px #0005", fontSize: 13, fontWeight: 800 },
  error: { padding: 12, borderRadius: 10, background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444", fontSize: 13 },
  empty: { padding: 40, textAlign: "center", background: "var(--p-card)", border: "1px dashed var(--p-border)", borderRadius: 16, color: "var(--p-text-3)" },
  hint: { margin: "5px 0 0", fontSize: 11, color: "var(--p-text-4)" },
  muted: { color: "var(--p-text-4)", fontSize: 11, marginTop: 3 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 },
  stat: { padding: 14, borderRadius: 14, background: "var(--p-card)", border: "1px solid var(--p-border)" }, statValue: { fontSize: 24, fontWeight: 900 }, statLabel: { fontSize: 11, color: "var(--p-text-3)", fontWeight: 700, marginTop: 3 },
  tableWrap: { overflowX: "auto", background: "var(--p-card)", border: "1px solid var(--p-border)", borderRadius: 14 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 880 },
  actions: { display: "flex", gap: 5, flexWrap: "wrap" }, analysisCard: { background: "var(--p-card)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 16 },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 14 }, pager: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, color: "var(--p-text-3)", fontSize: 12 },
};
