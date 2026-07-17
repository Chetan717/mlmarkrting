import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../../../Firebase";
import Paginator from "./Paginator";

// ── SVG Icons ─────────────────────────────────────────────
const IcReceipt = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
);
const IcMoney = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
const IcAward = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
);
const IcCheckCir = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const IcPhone = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.14-1.93a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.6z"/></svg>
);
const IcAlert = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const IcBarChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
);
const IcInbox = () => (
  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
);
const IcChevDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);

const SUB_PER_PAGE = 20;

const fmtINR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

function exportCSVReport(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getMonthKey(dateVal) {
  let d;
  if (dateVal && typeof dateVal.toDate === "function") {
    d = dateVal.toDate();
  } else {
    d = new Date(dateVal);
  }
  if (!d || isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

const statusBadge = (sub) => {
  if (sub.Active && !sub.Expire) return { label: "Active", color: "#10b981", bg: "#10b98115" };
  if (sub.Expire) return { label: "Expired", color: "#ef4444", bg: "#ef444415" };
  return { label: "Inactive", color: "#f59e0b", bg: "#f59e0b15" };
};

export default function MonthWiseReport({ mteamId, mobile }) {
  const [subscribers, setSubscribers] = useState([]);
  const [coupon, setCoupon] = useState(null);
  const [commPct, setCommPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [monthPages, setMonthPages] = useState({});
  const getMonthPage = (key) => monthPages[key] ?? 1;
  const setMonthPage = (key, p) => setMonthPages((prev) => ({ ...prev, [key]: p }));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const mteamSnap = await getDocs(
          query(collection(db, "mteam"), where("mobile", "==", mobile))
        );
        if (mteamSnap.empty) throw new Error("Marketing member not found.");

        const mt = { id: mteamSnap.docs[0].id, ...mteamSnap.docs[0].data() };

        let couponDoc = null;
        try {
          const snap = await getDoc(doc(db, "couponcode", mt.assign_coupon_id));
          if (snap.exists()) couponDoc = { id: snap.id, ...snap.data() };
        } catch (_) {}

        if (!couponDoc) {
          const cSnap = await getDocs(
            query(collection(db, "couponcode"), where("assigned_user.id", "==", mt.id))
          );
          if (!cSnap.empty) couponDoc = { id: cSnap.docs[0].id, ...cSnap.docs[0].data() };
        }

        if (!couponDoc) throw new Error("No coupon assigned to this account.");

        setCoupon(couponDoc);
        setCommPct(couponDoc.marketing_member_percentage ?? 0);

        const subSnap = await getDocs(
          query(
            collection(db, "subscription"),
            where("couponApplied", "==", couponDoc.code),
            where("payment", "==", "Success")
          )
        );

        const subs = subSnap.docs.map((d) => ({ documentId: d.id, ...d.data() }));
        setSubscribers(subs);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [mobile, mteamId]);

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return subscribers;
    const from = fromDate ? new Date(fromDate) : null;
    if (from) from.setHours(0, 0, 0, 0);
    const to = toDate ? new Date(toDate) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return subscribers.filter((s) => {
      if (!s.PurchaseAt) return false;
      const d = s.PurchaseAt?.toDate ? s.PurchaseAt.toDate() : new Date(s.PurchaseAt);
      if (isNaN(d.getTime())) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [subscribers, fromDate, toDate]);

  const monthlyData = useMemo(() => {
    const map = {};
    for (const sub of filtered) {
      const key = getMonthKey(sub.PurchaseAt);
      if (!key) continue;
      if (!map[key]) map[key] = { key, subs: [], revenue: 0, commission: 0 };
      map[key].subs.push(sub);
      const amt = sub.PaymentAmount ?? 0;
      map[key].revenue += amt;
      map[key].commission += Math.round(amt * (commPct / 100));
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered, commPct]);

  const totalRevenue = filtered.reduce((a, s) => a + (s.PaymentAmount ?? 0), 0);
  const totalCommission = Math.round(totalRevenue * (commPct / 100));

  // Build per-user subscription order from ALL subscribers (to correctly tag 1st vs renewal)
  const { newCommission, renewalCommission } = useMemo(() => {
    // Sort all subscribers per mobile by purchase date (oldest first)
    const allByUser = {};
    for (const sub of subscribers) {
      const m = sub.mobileNo;
      if (!m) continue;
      if (!allByUser[m]) allByUser[m] = [];
      allByUser[m].push(sub);
    }
    for (const m in allByUser) {
      allByUser[m].sort((a, b) => {
        const getTs = (s) => {
          if (!s.PurchaseAt) return 0;
          if (s.PurchaseAt?.toDate) return s.PurchaseAt.toDate().getTime();
          return new Date(s.PurchaseAt).getTime();
        };
        return getTs(a) - getTs(b);
      });
    }
    // Tag each subscription: index 0 = "new", index 1+ = "renewal"
    const firstSubIds = new Set();
    for (const m in allByUser) {
      const first = allByUser[m][0];
      if (first?.documentId) firstSubIds.add(first.documentId);
    }
    // Now compute from the date-filtered set
    let newC = 0, renewalC = 0;
    for (const sub of filtered) {
      const amt = sub.PaymentAmount ?? 0;
      const comm = Math.round(amt * (commPct / 100));
      if (firstSubIds.has(sub.documentId)) newC += comm;
      else renewalC += comm;
    }
    return { newCommission: newC, renewalCommission: renewalC };
  }, [subscribers, filtered, commPct]);

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
        <p style={{ color: "#64748b", marginTop: 14, fontSize: 14 }}>Loading report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.center}>
        <span style={{ color: "#ef4444" }}><IcAlert /></span>
        <p style={{ color: "#ef4444", marginTop: 10, fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.pageTitle}><span style={{ color: "#6366f1", verticalAlign: "middle", marginRight: 8 }}><IcBarChart /></span>Month Wise Report</h2>
          <p style={s.pageSub}>
            {coupon && (
              <span>
                Coupon: <strong style={{ color: "#a5b4fc" }}>{coupon.code}</strong>
                &nbsp;·&nbsp;Commission: <strong style={{ color: "#f59e0b" }}>{commPct}%</strong>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            const headers = ["Month", "Name", "Mobile", "Plan", "Status", "Amount (₹)", `Commission (${commPct}%)`, "Purchase Date"];
            const rows = [];
            monthlyData.forEach((m) => {
              m.subs.forEach((sub) => {
                const badge = statusBadge(sub);
                const comm = Math.round((sub.PaymentAmount ?? 0) * (commPct / 100));
                const d = sub.PurchaseAt?.toDate ? sub.PurchaseAt.toDate() : new Date(sub.PurchaseAt);
                const date = sub.PurchaseAt && !isNaN(d.getTime())
                  ? d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
                  : "—";
                rows.push([getMonthLabel(m.key), sub.UserName ?? "—", sub.mobileNo ?? "—", sub.plan ?? "—", badge.label, sub.PaymentAmount ?? 0, comm, date]);
              });
            });
            exportCSVReport(
              `monthly-report-${fromDate || "all"}-to-${toDate || "now"}.csv`,
              headers, rows
            );
          }}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:10, border:"1.5px solid #10b98160", background:"#10b98115", color:"#10b981", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Excel ({filtered.length} records)
        </button>
      </div>

      {/* ── Date Range Picker ───────────────────────────────────────── */}
      <div style={s.filterCard}>
        <div style={s.filterRow}>
          <div style={s.filterField}>
            <label style={s.filterLabel}>From Date</label>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={s.dateInput}
            />
          </div>
          <div style={{ ...s.filterField, position: "relative" }}>
            <label style={s.filterLabel}>To Date</label>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setToDate(e.target.value)}
              style={s.dateInput}
            />
          </div>
          <div style={s.filterField}>
            <label style={s.filterLabel}>Quick Select</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "This Month", fn: () => {
                  const t = new Date();
                  setFromDate(new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10));
                  setToDate(t.toISOString().slice(0, 10));
                }},
                { label: "Last Month", fn: () => {
                  const t = new Date();
                  const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
                  const last  = new Date(t.getFullYear(), t.getMonth(), 0);
                  setFromDate(first.toISOString().slice(0, 10));
                  setToDate(last.toISOString().slice(0, 10));
                }},
                { label: "Last 3 Mo", fn: () => {
                  const t = new Date();
                  const from = new Date(t.getFullYear(), t.getMonth() - 2, 1);
                  setFromDate(from.toISOString().slice(0, 10));
                  setToDate(t.toISOString().slice(0, 10));
                }},
                { label: "This Year", fn: () => {
                  const t = new Date();
                  setFromDate(`${t.getFullYear()}-01-01`);
                  setToDate(t.toISOString().slice(0, 10));
                }},
              ].map((q) => (
                <button key={q.label} style={s.quickBtn} onClick={q.fn}>{q.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      <div style={s.statsRow}>
        <StatCard icon={<IcReceipt />} label="Total Sales" value={filtered.length} accent="#6366f1" sub="in selected period" />
        <StatCard icon={<IcMoney />} label="Total Revenue" value={fmtINR(totalRevenue)} accent="#f59e0b" sub="from all sales" big />
        <StatCard icon={<IcAward />} label="Your Commission" value={fmtINR(totalCommission)} accent="#10b981" sub={`@ ${commPct}%`} big />
        <StatCard icon={<IcCheckCir />} label="New Commission" value={fmtINR(newCommission)} accent="#6366f1" sub="1st sub per user" />
        <StatCard icon={<IcCheckCir />} label="Renewal Commission" value={fmtINR(renewalCommission)} accent="#8b5cf6" sub="2nd+ subs per user" />
      </div>

      {/* ── Monthly Breakdown ────────────────────────────────────────── */}
      {monthlyData.length === 0 ? (
        <div style={s.empty}>
          <span style={{ color: "var(--p-text-4)" }}><IcInbox /></span>
          <p style={{ color: "var(--p-text-3)", marginTop: 10 }}>No sales found in this date range.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {monthlyData.map((m) => {
            const isOpen = expandedMonth === m.key;
            return (
              <div key={m.key} style={s.monthCard}>
                {/* Month header — clickable */}
                <div
                  style={s.monthHeader}
                  onClick={() => setExpandedMonth(isOpen ? null : m.key)}
                >
                  <div style={s.monthLeft}>
                    <span style={s.monthBadge}>{getMonthLabel(m.key)}</span>
                    <span style={s.monthCount}>{m.subs.length} sale{m.subs.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={s.monthRight}>
                    <div style={s.monthStat}>
                      <span style={s.monthStatLabel}>Revenue</span>
                      <span style={{ ...s.monthStatValue, color: "#f59e0b" }}>{fmtINR(m.revenue)}</span>
                    </div>
                    <div style={s.monthDivider} />
                    <div style={s.monthStat}>
                      <span style={s.monthStatLabel}>Commission</span>
                      <span style={{ ...s.monthStatValue, color: "#10b981" }}>{fmtINR(m.commission)}</span>
                    </div>
                    <span style={{ ...s.chevron, transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}><IcChevDown /></span>
                  </div>
                </div>

                {/* Expanded subscriber list */}
                {isOpen && (() => {
                  const mPage    = getMonthPage(m.key);
                  const pageRows = m.subs.slice((mPage - 1) * SUB_PER_PAGE, mPage * SUB_PER_PAGE);
                  return (
                    <div style={s.subList}>
                      <div style={s.subListHeader}>
                        <span style={{ flex: 2 }}>Name / Mobile</span>
                        <span style={{ flex: 1, textAlign: "center" }}>Plan</span>
                        <span style={{ flex: 1, textAlign: "center" }}>Status</span>
                        <span style={{ flex: 1, textAlign: "right" }}>Amount</span>
                        <span style={{ flex: 1, textAlign: "right" }}>Commission</span>
                        <span style={{ flex: 1.2, textAlign: "right" }}>Date</span>
                      </div>
                      {pageRows.map((sub, i) => {
                        const badge = statusBadge(sub);
                        const comm  = Math.round((sub.PaymentAmount ?? 0) * (commPct / 100));
                        const date  = sub.PurchaseAt
                          ? new Date(sub.PurchaseAt).toLocaleDateString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : "—";
                        return (
                          <div key={i} style={{ ...s.subRow, background: i % 2 === 0 ? "#ffffff05" : "transparent" }}>
                            <div style={{ flex: 2 }}>
                              <p style={s.subName}>{sub.UserName ?? "—"}</p>
                              <p style={{ ...s.subMobile, display:"flex", alignItems:"center", gap:4 }}><IcPhone /> {sub.mobileNo}</p>
                            </div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <span style={s.planPill}>{sub.plan ?? "—"}</span>
                            </div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <span style={{ ...s.statusPill, background: badge.bg, color: badge.color }}>
                                {badge.label}
                              </span>
                            </div>
                            <div style={{ flex: 1, textAlign: "right", color: "var(--p-text)", fontWeight: 700, fontSize: 13 }}>
                              {fmtINR(sub.PaymentAmount)}
                            </div>
                            <div style={{ flex: 1, textAlign: "right", color: "#10b981", fontWeight: 700, fontSize: 13 }}>
                              +{fmtINR(comm)}
                            </div>
                            <div style={{ flex: 1.2, textAlign: "right", color: "#64748b", fontSize: 12 }}>
                              {date}
                            </div>
                          </div>
                        );
                      })}
                      <div style={s.subListFooter}>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {m.subs.length} record{m.subs.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>
                          Total: {fmtINR(m.revenue)}
                        </span>
                        <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>
                          Commission: {fmtINR(m.commission)}
                        </span>
                      </div>
                      <div style={{ padding: "0 12px 12px" }}>
                        <Paginator
                          total={m.subs.length}
                          page={mPage}
                          perPage={SUB_PER_PAGE}
                          onChange={(p) => setMonthPage(m.key, p)}
                          accent="#f59e0b"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      <p style={s.footer}>
        {filtered.length} sale{filtered.length !== 1 ? "s" : ""} &nbsp;·&nbsp; {monthlyData.length} month{monthlyData.length !== 1 ? "s" : ""}
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent, big }) {
  return (
    <div style={{ ...s.statCard, borderTop: `3px solid ${accent}` }}>
      <div style={{ ...s.statIcon, background: accent + "18", color: accent }}>{icon}</div>
      <div>
        <p style={s.statLabel}>{label}</p>
        <p style={{ ...s.statValue, color: accent, fontSize: big ? "1.6rem" : "1.3rem" }}>{value}</p>
        <p style={s.statSub}>{sub}</p>
      </div>
    </div>
  );
}

const s = {
  root: {
    padding: "24px 20px 60px",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    maxWidth: 1100,
    margin: "0 auto",
    color: "var(--p-text)",
  },
  center: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "80px 20px",
  },
  spinner: {
    width: 36, height: 36, borderRadius: "50%",
    border: "3px solid var(--p-border)", borderTopColor: "#6366f1",
    animation: "spin 0.8s linear infinite",
  },
  pageHeader: {
    marginBottom: 22,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  pageTitle: {
    margin: 0, fontSize: 22, fontWeight: 800, color: "var(--p-text)",
    display: "flex", alignItems: "center", gap: 8,
  },
  pageSub: {
    margin: "5px 0 0", fontSize: 13, color: "var(--p-text-3)",
  },
  filterCard: {
    background: "var(--p-card)",
    border: "1px solid var(--p-border)",
    borderRadius: 16,
    padding: "20px 24px",
    marginBottom: 24,
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
    alignItems: "flex-end",
  },
  filterField: {
    display: "flex", flexDirection: "column", gap: 6,
  },
  filterLabel: {
    fontSize: 11, fontWeight: 700, color: "var(--p-text-3)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  dateInput: {
    padding: "9px 12px",
    background: "var(--p-bg)",
    border: "1.5px solid var(--p-border)",
    borderRadius: 10,
    color: "var(--p-text)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  quickBtn: {
    padding: "7px 12px",
    background: "var(--p-bg)",
    border: "1px solid var(--p-border)",
    borderRadius: 8,
    color: "var(--p-text-2)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  statCard: {
    background: "var(--p-card2)",
    border: "1px solid var(--p-border)",
    borderRadius: 14,
    padding: "16px 18px",
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  statIcon: {
    width: 40, height: 40, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  statLabel: {
    margin: 0, fontSize: 11, fontWeight: 700, color: "var(--p-text-3)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  statValue: {
    margin: "3px 0 2px", fontWeight: 800,
    fontFamily: "'Space Mono',monospace",
  },
  statSub: {
    margin: 0, fontSize: 11, color: "var(--p-text-4)",
  },
  monthCard: {
    background: "var(--p-card2)",
    border: "1px solid var(--p-border)",
    borderRadius: 14,
    overflow: "hidden",
  },
  monthHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    padding: "16px 20px",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  monthLeft: {
    display: "flex", alignItems: "center", gap: 12,
  },
  monthBadge: {
    fontSize: 15, fontWeight: 800, color: "var(--p-text)",
  },
  monthCount: {
    padding: "3px 10px",
    background: "#6366f115",
    border: "1px solid #6366f130",
    borderRadius: 20,
    color: "#a5b4fc",
    fontSize: 11,
    fontWeight: 700,
  },
  monthRight: {
    display: "flex", alignItems: "center", gap: 20,
  },
  monthStat: {
    display: "flex", flexDirection: "column", alignItems: "flex-end",
  },
  monthStatLabel: {
    fontSize: 10, fontWeight: 700, color: "var(--p-text-4)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  monthStatValue: {
    fontSize: 16, fontWeight: 800, fontFamily: "'Space Mono',monospace",
  },
  monthDivider: {
    width: 1, height: 32, background: "var(--p-border)",
  },
  chevron: {
    color: "var(--p-text-4)",
    display: "inline-flex", alignItems: "center",
    transition: "transform 0.2s",
    userSelect: "none",
  },
  subList: {
    borderTop: "1px solid var(--p-border)",
  },
  subListHeader: {
    display: "flex",
    padding: "10px 20px",
    background: "var(--p-bg)",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--p-text-4)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    gap: 8,
  },
  subRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 20px",
    gap: 8,
    borderTop: "1px solid var(--p-border)",
  },
  subName: {
    margin: 0, fontSize: 13, fontWeight: 700, color: "var(--p-text)",
  },
  subMobile: {
    margin: "2px 0 0", fontSize: 11, color: "var(--p-text-3)",
  },
  planPill: {
    padding: "3px 8px",
    background: "#6366f115",
    color: "#a5b4fc",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  statusPill: {
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  subListFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 20,
    padding: "10px 20px",
    borderTop: "1px solid var(--p-border)",
    background: "var(--p-bg)",
  },
  empty: {
    textAlign: "center",
    padding: "60px 20px",
    background: "var(--p-card2)",
    border: "1px dashed var(--p-border)",
    borderRadius: 16,
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  footer: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 12,
    color: "var(--p-text-4)",
  },
};
