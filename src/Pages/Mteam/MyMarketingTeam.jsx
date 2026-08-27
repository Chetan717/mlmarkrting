import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../Firebase";

const PAGE_SIZE = 20;
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const messageOf = error => String(error?.message || "Data load नहीं हुआ।").replace(/^Firebase(?:Error)?:?\s*/i, "").replace(/functions\/[a-z-]+\)?\.?/gi, "").trim();
const selectStyle = { padding: "9px 11px", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-card)", color: "var(--p-text)", fontSize: 12, outline: "none" };

export default function MyMarketingTeam() {
  const [team, setTeam] = useState([]), [teamBonusTotal, setTeamBonusTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null), [leadData, setLeadData] = useState(null), [leadLoading, setLeadLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await httpsCallable(functions, "marketingGetMyTeam")({}); setTeam(result.data.members || []); setTeamBonusTotal(result.data.teamBonusTotal || 0); }
    catch (caught) { setError(messageOf(caught)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return q ? team.filter(member => [member.name, member.couponCode, member.referCode, member.loginEmailMasked].some(value => String(value || "").toLowerCase().includes(q))) : team; }, [search, team]);
  const openMember = async member => {
    setSelected(member); setLeadLoading(true); setLeadData(null); setError("");
    try { const result = await httpsCallable(functions, "marketingGetTeamMemberLeads")({ memberId: member.id }); setLeadData(result.data); }
    catch (caught) { setError(messageOf(caught)); } finally { setLeadLoading(false); }
  };
  if (selected) return <TeamLeads member={selected} data={leadData} loading={leadLoading} error={error} onBack={() => { setSelected(null); setLeadData(null); setError(""); }} />;
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <div><span style={eyebrow}>ADMIN-ASSIGNED HIERARCHY</span><h1 style={{ margin: "9px 0 4px", color: "var(--p-text)", fontSize: 24 }}>My Marketing Team</h1><p style={{ margin: 0, color: "var(--p-text-3)", fontSize: 13 }}>Direct members assigned under you. Hierarchy and percentages are read-only.</p></div>
        <div style={{ padding: "14px 18px", border: "1px solid #10b98140", borderRadius: 14, background: "#10b98110", minWidth: 190 }}><div style={{ color: "var(--p-text-3)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Total Team Bonus</div><div style={{ color: "#10b981", fontSize: 25, fontWeight: 900 }}>{money(teamBonusTotal)}</div><div style={{ color: "var(--p-text-4)", fontSize: 10 }}>From direct members' commission</div></div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search member, coupon, refer code…" style={{ ...selectStyle, flex: 1, maxWidth: 430 }} /><button onClick={load} disabled={loading} style={secondaryButton}>{loading ? "Loading…" : "Refresh"}</button></div>
      {error && <Notice color="#ef4444">{error}</Notice>}
      {!loading && !team.length && <Empty title="No assigned Marketing members" text="Admin से member assignment और percentage configure कराएं।" />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {filtered.map(member => <article key={member.id} style={{ border: "1px solid var(--p-border)", background: "var(--p-card)", borderRadius: 18, padding: 18 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontWeight: 900 }}>{member.name?.[0]?.toUpperCase() || "M"}</div><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800, color: "var(--p-text)" }}>{member.name}</div><div style={{ color: "var(--p-text-4)", fontSize: 11 }}>{member.loginEmailMasked}</div></div><span style={{ fontSize: 11, fontWeight: 700, color: member.active ? "#10b981" : "#ef4444" }}>{member.active ? "Active" : "Inactive"}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}><Metric label="Users" value={member.userCount} /><Metric label="Sales" value={member.salesCount} /><Metric label="Member Commission" value={`${member.commissionPercentage}%`} /><Metric label="Your Bonus Rate" value={`${member.uplineBonusPercentage}%`} /><Metric label="Member Earnings" value={money(member.childCommission)} /><Metric label="Your Team Bonus" value={money(member.parentBonus)} accent /></div>
          <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><div><div style={{ fontSize: 10, color: "var(--p-text-4)", textTransform: "uppercase", fontWeight: 700 }}>Coupon / Refer</div><button onClick={() => openMember(member)} style={{ border: 0, background: "none", padding: 0, color: "#818cf8", fontFamily: "monospace", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>{member.couponCode || "No coupon"}</button><div style={{ fontFamily: "monospace", color: "var(--p-text-4)", fontSize: 11 }}>{member.referCode || "No refer code"}</div></div><button onClick={() => openMember(member)} style={primaryButton}>View Users</button></div>
        </article>)}
      </div>
      {loading && <Empty title="Loading team…" text="Accurate users, sales and commission totals are being calculated." />}
    </div>
  );
}

function TeamLeads({ member, data, loading, error, onBack }) {
  const [filters, setFilters] = useState({ search: "", planStatus: "all", profile: "all", company: "all", leadStatus: "all", from: "", to: "" });
  const [page, setPage] = useState(1);
  const leads = data?.leads || [];
  const companies = useMemo(() => [...new Set(leads.map(lead => lead.companyName).filter(Boolean))].sort(), [leads]);
  const leadStatuses = useMemo(() => [...new Set(leads.map(lead => lead.leadStatus).filter(Boolean))].sort(), [leads]);
  const filtered = useMemo(() => leads.filter(lead => {
    const q = filters.search.trim().toLowerCase();
    if (q && ![lead.name, lead.companyName, lead.plan, lead.planStatus, lead.leadStatus, lead.couponCode].some(value => String(value || "").toLowerCase().includes(q))) return false;
    if (filters.planStatus !== "all" && lead.planStatus !== filters.planStatus) return false;
    if (filters.profile === "yes" && !lead.hasMlmProfile) return false;
    if (filters.profile === "no" && lead.hasMlmProfile) return false;
    if (filters.company !== "all" && lead.companyName !== filters.company) return false;
    if (filters.leadStatus !== "all" && lead.leadStatus !== filters.leadStatus) return false;
    if (filters.from && (!lead.joinedAt || lead.joinedAt < new Date(`${filters.from}T00:00:00`).getTime())) return false;
    if (filters.to && (!lead.joinedAt || lead.joinedAt > new Date(`${filters.to}T23:59:59.999`).getTime())) return false;
    return true;
  }), [filters, leads]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), safePage = Math.min(page, totalPages), visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const set = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <button onClick={onBack} style={{ ...secondaryButton, marginBottom: 15 }}>← Back to My Team</button>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 15 }}><div><span style={eyebrow}>READ-ONLY TEAM LEADS</span><h1 style={{ margin: "8px 0 3px", color: "var(--p-text)", fontSize: 23 }}>{data?.member?.name || member.name}</h1><p style={{ margin: 0, color: "var(--p-text-3)", fontSize: 13 }}>Coupon {data?.member?.couponCode || member.couponCode || "—"} · {data?.totalUsers ?? member.userCount} total users · {data?.member?.commissionPercentage ?? member.commissionPercentage}% commission</p></div><Notice color="#10b981">🔒 Mobile number and password are not returned or shown in this view.</Notice></div>
      {error && <Notice color="#ef4444">{error}</Notice>}{data?.truncated && <Notice color="#f59e0b">Only the newest 5,000 sanitized rows are shown. Total user count remains accurate.</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(190px,2fr) repeat(6,minmax(120px,1fr))", gap: 8, overflowX: "auto", marginBottom: 14 }}><input style={selectStyle} placeholder="Search name, company, plan…" value={filters.search} onChange={event => set("search", event.target.value)} /><select style={selectStyle} value={filters.planStatus} onChange={event => set("planStatus", event.target.value)}><option value="all">All plan status</option>{["No Plan", "Active", "Expired", "Inactive"].map(value => <option key={value}>{value}</option>)}</select><select style={selectStyle} value={filters.profile} onChange={event => set("profile", event.target.value)}><option value="all">All profiles</option><option value="yes">Has MLM profile</option><option value="no">No MLM profile</option></select><select style={selectStyle} value={filters.company} onChange={event => set("company", event.target.value)}><option value="all">All companies</option>{companies.map(value => <option key={value}>{value}</option>)}</select><select style={selectStyle} value={filters.leadStatus} onChange={event => set("leadStatus", event.target.value)}><option value="all">All lead status</option>{leadStatuses.map(value => <option key={value}>{value}</option>)}</select><input aria-label="Joined from" type="date" style={selectStyle} value={filters.from} onChange={event => set("from", event.target.value)} /><input aria-label="Joined to" type="date" style={selectStyle} value={filters.to} onChange={event => set("to", event.target.value)} /></div>
      {loading ? <Empty title="Loading sanitized users…" text="Mobile number and password are excluded by the server." /> : <div style={{ overflowX: "auto", border: "1px solid var(--p-border)", borderRadius: 14 }}><table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", background: "var(--p-card)" }}><thead><tr style={{ background: "var(--p-card2)" }}>{["#", "User", "Joined", "MLM Profile", "Company", "Plan", "Plan Status", "Expiry", "Days Left", "Lead Status", "Next Follow-up"].map(title => <th key={title} style={th}>{title}</th>)}</tr></thead><tbody>{visible.map((lead, index) => <tr key={lead.id} style={{ borderTop: "1px solid var(--p-border)" }}><td style={td}>{(safePage - 1) * PAGE_SIZE + index + 1}</td><td style={{ ...td, fontWeight: 800, color: "var(--p-text)" }}>{lead.name || "User"}</td><td style={td}>{dateText(lead.joinedAt)}</td><td style={td}><Badge value={lead.hasMlmProfile ? "Yes" : "No"} good={lead.hasMlmProfile} /></td><td style={td}>{lead.companyName || "—"}</td><td style={td}>{lead.plan || "—"}</td><td style={td}><Badge value={lead.planStatus} good={lead.planStatus === "Active"} /></td><td style={td}>{lead.expiryDate || "—"}</td><td style={td}>{lead.daysLeft ?? "—"}</td><td style={td}>{lead.leadStatus || "New"}</td><td style={td}>{lead.nextFollowupDate || "—"}</td></tr>)}{!visible.length && <tr><td colSpan="11" style={{ ...td, textAlign: "center", padding: 40 }}>No users match these filters.</td></tr>}</tbody></table></div>}
      {!loading && filtered.length > PAGE_SIZE && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, color: "var(--p-text-3)", fontSize: 12 }}><span>{filtered.length} matched</span><div style={{ display: "flex", gap: 8 }}><button style={secondaryButton} disabled={safePage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><span style={{ padding: "8px 4px" }}>{safePage} / {totalPages}</span><button style={secondaryButton} disabled={safePage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>}
    </div>
  );
}

function Metric({ label, value, accent }) { return <div style={{ padding: 10, borderRadius: 10, background: "var(--p-card2)" }}><div style={{ fontSize: 10, color: "var(--p-text-4)", fontWeight: 700, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 16, fontWeight: 900, color: accent ? "#10b981" : "var(--p-text)" }}>{value}</div></div>; }
function Notice({ children, color }) { return <div style={{ border: `1px solid ${color}40`, background: `${color}10`, color, borderRadius: 11, padding: "9px 12px", fontSize: 12, fontWeight: 650, marginBottom: 10 }}>{children}</div>; }
function Empty({ title, text }) { return <div style={{ padding: 50, textAlign: "center", color: "var(--p-text-3)", border: "1px dashed var(--p-border)", borderRadius: 16 }}><div style={{ color: "var(--p-text)", fontWeight: 800 }}>{title}</div><div style={{ marginTop: 5, fontSize: 12 }}>{text}</div></div>; }
function Badge({ value, good }) { return <span style={{ padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: good ? "#10b981" : "#f59e0b", background: good ? "#10b98115" : "#f59e0b15" }}>{value}</span>; }
const eyebrow = { display: "inline-block", color: "#818cf8", fontSize: 10, fontWeight: 800, letterSpacing: ".09em" };
const primaryButton = { border: 0, borderRadius: 9, padding: "8px 12px", background: "#6366f1", color: "white", cursor: "pointer", fontWeight: 750, fontSize: 12 };
const secondaryButton = { border: "1px solid var(--p-border)", borderRadius: 9, padding: "8px 12px", background: "var(--p-card)", color: "var(--p-text-2)", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const th = { padding: "11px 12px", fontSize: 10, color: "var(--p-text-4)", textTransform: "uppercase", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "11px 12px", fontSize: 12, color: "var(--p-text-3)", whiteSpace: "nowrap" };
