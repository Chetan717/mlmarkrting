import { useState, useEffect, useMemo } from "react";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import { db, functions } from "../../../Firebase";
import { httpsCallable } from "firebase/functions";
import { COLL } from "../../Utils/collections";
import {
  calculateMlmProfileStats,
  fetchMlmProfiles,
} from "../../Utils/mlmProfile";

// ── Date helper ──────────────────────────────────────────────
const MONTHS_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseDMY(str) {
  if (!str || typeof str !== "string") return null;
  str = str.trim();
  const mname = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (mname) {
    const d=Number(mname[1]),m=MONTHS_MAP[mname[2].toLowerCase().slice(0,3)],y=Number(mname[3]);
    if (d && m!==undefined && y) return new Date(y,m,d);
  }
  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) return new Date(Number(slash[3]),Number(slash[2])-1,Number(slash[1]));
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]));
  return null;
}
function getPurchaseTs(sub) {
  if (!sub.PurchaseAt) return 0;
  if (sub.PurchaseAt?.toDate) return sub.PurchaseAt.toDate().getTime();
  return new Date(sub.PurchaseAt).getTime();
}

// ── SVG Icons ──────────────────────────────────────────────
const IcMoney     = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const IcTag       = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IcCheckCir  = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IcClock     = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcRefresh   = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.9"/></svg>;
const IcUsers     = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IcUserX     = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>;
const IcStar      = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IcMinus     = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
const IcTicket    = ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>;
const IcPhone     = ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.14-1.93a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.6z"/></svg>;
const IcEye       = ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcNewUser   = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>;

const ITEMS_PER_PAGE = 10;

const planColor = (plan) => {
  const map = { Basic:"#f59e0b", Pro:"#6366f1", Premium:"#10b981", Enterprise:"#ec4899" };
  return map[plan] ?? "#94a3b8";
};

const statusBadge = (sub) => {
  if (sub.Active && !sub.Expire) return { label:"Active",   color:"#10b981", bg:"#d1fae522" };
  if (sub.Expire)                 return { label:"Expired",  color:"#ef4444", bg:"#fee2e222" };
  return                                  { label:"Inactive", color:"#f59e0b", bg:"#fef3c722" };
};

const fmtINR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

// ── stat card component ────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent, big, wide }) {
  return (
    <div style={{
      background:"var(--p-card)",
      borderRadius:16,
      border:`1px solid ${accent}30`,
      padding: big ? "22px 20px" : "18px 16px",
      display:"flex", flexDirection:"column", gap:10,
      boxShadow:`0 2px 16px ${accent}10`,
      gridColumn: wide ? "span 2" : undefined,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{ position:"absolute", top:-18, right:-18, width:80, height:80, borderRadius:"50%", background:`${accent}10`, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ display:"flex", alignItems:"center", justifyContent:"center", width:38, height:38, borderRadius:10, background:`${accent}20`, color:accent }}>
          {icon}
        </span>
        <span style={{ fontSize:10, fontWeight:700, color:"var(--p-text-4)", textTransform:"uppercase", letterSpacing:"0.08em", textAlign:"right" }}>
          {label}
        </span>
      </div>
      <div>
        <p style={{ margin:0, fontSize: big ? 28 : 22, fontWeight:900, color:"var(--p-text)", letterSpacing:"-0.5px" }}>{value}</p>
        {sub && <p style={{ margin:"3px 0 0", fontSize:11, color:"var(--p-text-4)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function CouponStat({ label, value, accent }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2, minWidth:80 }}>
      <span style={{ fontSize:10, color:"var(--p-text-4)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
      <span style={{ fontSize:18, fontWeight:800, color:accent }}>{value}</span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:300, gap:16 }}>
      <div style={{ width:40, height:40, border:"3px solid var(--p-border)", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <p style={{ color:"var(--p-text-3)", fontSize:14, margin:0 }}>Loading dashboard…</p>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:300, gap:12, padding:20 }}>
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p style={{ color:"#ef4444", fontSize:14, margin:0, fontWeight:600 }}>{message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding:"60px 20px", textAlign:"center", color:"var(--p-text-4)" }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:12 }}>
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
      </svg>
      <p style={{ fontSize:15, fontWeight:600, margin:0, color:"var(--p-text-3)" }}>No subscribers yet</p>
      <p style={{ fontSize:13, margin:"6px 0 0" }}>Share your coupon code to start earning.</p>
    </div>
  );
}

function Pagination({ page, totalPages, total, perPage, goTo }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 2px", flexWrap:"wrap", gap:8 }}>
      <span style={{ fontSize:13, color:"var(--p-text-3)" }}>
        {Math.min((page-1)*perPage+1, total)}–{Math.min(page*perPage, total)} of {total}
      </span>
      <div style={{ display:"flex", gap:4 }}>
        {[1,"prev",...Array.from({length:Math.min(5,totalPages)},(_,i)=>{const s=Math.max(1,Math.min(page-2,totalPages-4));return s+i;}),"next",totalPages].filter((v,i,a)=>a.indexOf(v)===i).map((p) => {
          if (p === "prev") return <button key="prev" disabled={page===1} onClick={() => goTo(page-1)} style={pBtn(page===1)}>‹</button>;
          if (p === "next") return <button key="next" disabled={page===totalPages} onClick={() => goTo(page+1)} style={pBtn(page===totalPages)}>›</button>;
          return <button key={p} onClick={() => goTo(p)} style={{ ...pBtn(false), ...(p===page ? {background:"#6366f1",color:"#fff",borderColor:"#6366f1"} : {}) }}>{p}</button>;
        })}
      </div>
    </div>
  );
}
function pBtn(disabled) {
  return {
    width:32, height:32, borderRadius:8, border:"1.5px solid var(--p-border)",
    background:"var(--p-card)", color: disabled ? "var(--p-text-4)" : "var(--p-text-2)",
    fontSize:13, fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
    display:"inline-flex", alignItems:"center", justifyContent:"center",
    opacity: disabled ? 0.4 : 1,
  };
}

// ── Tab button ─────────────────────────────────────────────
function DashTab({ label, active, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className="dash-tab-btn"
      style={{
        background: active ? (accent + "18") : "transparent",
        color: active ? accent : "var(--p-text-3)",
        borderBottom: active ? `2.5px solid ${accent}` : "2.5px solid transparent",
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
    </button>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export default function MarketingDashboard({ mteamSession } = {}) {
  const [mlmUser, setMlmUser]       = useState(null);
  const [mteamDoc, setMteamDoc]     = useState(null);
  const [couponDoc, setCouponDoc]   = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [referredUsers, setReferredUsers]   = useState([]);
  const [mlmProfiles, setMlmProfiles]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [search, setSearch]                 = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [sortBy, setSortBy]                 = useState("date");
  const [page, setPage]                     = useState(1);
  const [selectedSub, setSelectedSub]       = useState(null);
  const [modalOpen, setModalOpen]           = useState(false);
  const [dashTab, setDashTab]               = useState("financial");

  // ── 1. resolve session ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (mteamSession) {
        setMlmUser({
          mobileNo: mteamSession.mobile,
          name:     mteamSession.name,
          _mteamId: mteamSession.mteamId,
        });
        return;
      }
      throw new Error("Session expired. Please log in again.");
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [mteamSession]);

  // ── 2. fetch all data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mlmUser) return;
    const run = async () => {
      setLoading(true);
      try {
        // A: mteam doc
        let mt;
        if (mlmUser._mteamId) {
          const snap = await getDoc(doc(db, COLL.MTEAM, mlmUser._mteamId));
          if (!snap.exists()) throw new Error("Marketing team record not found.");
          mt = { documentId: snap.id, ...snap.data() };
        } else {
          const mteamSnap = await getDocs(
            query(collection(db, COLL.MTEAM), where("mobile", "==", mlmUser.mobileNo))
          );
          if (mteamSnap.empty) throw new Error("No marketing team record found.");
          mt = { documentId: mteamSnap.docs[0].id, ...mteamSnap.docs[0].data() };
        }
        setMteamDoc(mt);

        // B: coupon doc
        let coupon = null;
        if (mt.assign_coupon_id) {
          try {
            const snap = await getDoc(doc(db, COLL.COUPONCODE, mt.assign_coupon_id));
            if (snap.exists()) coupon = { documentId: snap.id, ...snap.data() };
          } catch (_) {}
        }
        if (!coupon) {
          const cSnap = await getDocs(
            query(collection(db, COLL.COUPONCODE), where("assigned_user.id", "==", mt.documentId))
          );
          if (!cSnap.empty) coupon = { documentId: cSnap.docs[0].id, ...cSnap.docs[0].data() };
        }
        if (!coupon) throw new Error("No coupon assigned to this marketing member.");
        setCouponDoc(coupon);

        const couponCode = coupon.code;

        // C: subscriptions with this coupon
        const subSnap = await getDocs(
          query(
            collection(db, COLL.SUBSCRIPTION),
            where("couponApplied", "==", couponCode),
            where("payment", "==", "Success")
          )
        );
        const subs = await Promise.all(
          subSnap.docs.map(async (d) => {
            const sub = { documentId: d.id, ...d.data() };
            try {
              const uSnap = await getDocs(
                query(collection(db, COLL.USERS), where("referredByMteam", "==", mt.documentId), where("mobileNo", "==", sub.mobileNo))
              );
              if (!uSnap.empty) sub._user = { documentId: uSnap.docs[0].id, ...uSnap.docs[0].data() };
            } catch (_) {}
            return sub;
          })
        );
        setSubscribers(subs);

        // D: ALL users referred by this mteam member
        const refSnap = await getDocs(
          query(collection(db, COLL.USERS), where("referredByMteam", "==", mt.documentId))
        );
        const referred = refSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setReferredUsers(referred);

        // E: mlm profiles for referred users
        const mobiles = referred.map(u => u.mobileNo).filter(Boolean);
        const profileLookup = httpsCallable(functions, "marketingGetProfiles");
        const profiles = await fetchMlmProfiles(mobiles, profileLookup);
        setMlmProfiles(profiles);

      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [mlmUser]);

  useEffect(() => { setPage(1); }, [search, filterStatus, sortBy]);

  // ── derived stats ──────────────────────────────────────────────────────
  const commPct     = couponDoc?.marketing_member_percentage ?? 0;
  const discountPct = couponDoc?.user_discount ?? 0;

  // Group subscriptions by user (mobileNo), sorted oldest-first
  const subsByUser = useMemo(() => {
    const map = {};
    for (const sub of subscribers) {
      const m = sub.mobileNo;
      if (!m) continue;
      if (!map[m]) map[m] = [];
      map[m].push(sub);
    }
    for (const m in map) {
      map[m].sort((a, b) => getPurchaseTs(a) - getPurchaseTs(b));
    }
    return map;
  }, [subscribers]);

  // ── Financial stats ───────────────────────────────────────
  const totalRevenue    = subscribers.reduce((a, s) => a + (s.PaymentAmount ?? 0), 0);
  const totalCommission = Math.round(totalRevenue * (commPct / 100));

  // New Commission = commission from the 1st subscription of each user
  // Renewal Commission = commission from 2nd+ subscriptions of each user
  const { newCommission, renewalCommission } = useMemo(() => {
    let newC = 0, renewalC = 0;
    for (const mobile in subsByUser) {
      const subs = subsByUser[mobile];
      subs.forEach((sub, idx) => {
        const amt = sub.PaymentAmount ?? 0;
        const comm = Math.round(amt * (commPct / 100));
        if (idx === 0) newC += comm;
        else renewalC += comm;
      });
    }
    return { newCommission: newC, renewalCommission: renewalC };
  }, [subsByUser, commPct]);

  // ── Referred Users stats ──────────────────────────────────
  const {
    totalUsers,
    hasProfileCount,
    noProfileCount,
  } = useMemo(
    () => calculateMlmProfileStats(referredUsers, mlmProfiles),
    [referredUsers, mlmProfiles]
  );

  // ── Subscription stats ────────────────────────────────────
  const { totalActiveSubs, newSubCount, renewalSubCount, expiredSubCount } = useMemo(() => {
    // totalActiveSubs: unique users with at least 1 active subscription
    let totalActive = 0;
    let newSub = 0;      // users with exactly 1 subscription total
    let renewalSub = 0;  // users with 2+ subscriptions total
    let expiredSub = 0;  // users with no active subscription at all

    for (const mobile in subsByUser) {
      const subs = subsByUser[mobile];
      const hasActive = subs.some(s => s.Active && !s.Expire);
      const subCount = subs.length;

      if (hasActive) totalActive++;
      if (subCount === 1) newSub++;
      else if (subCount >= 2) renewalSub++;
      if (!hasActive) expiredSub++;
    }
    return {
      totalActiveSubs: totalActive,
      newSubCount: newSub,
      renewalSubCount: renewalSub,
      expiredSubCount: expiredSub,
    };
  }, [subsByUser]);

  // ── filtered / sorted subscriber list ─────────────────────────────────
  const filtered = subscribers
    .filter(s => {
      const name   = (s.UserName ?? s._user?.name ?? "").toLowerCase();
      const mobile = (s.mobileNo ?? "").toLowerCase();
      const q      = search.toLowerCase();
      const matchSearch = !q || name.includes(q) || mobile.includes(q);
      const badge  = statusBadge(s).label.toLowerCase();
      const matchStatus = filterStatus === "all" || badge === filterStatus;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "date")   return new Date(b.PurchaseAt) - new Date(a.PurchaseAt);
      if (sortBy === "amount") return (b.PaymentAmount ?? 0) - (a.PaymentAmount ?? 0);
      if (sortBy === "name")   return (a.UserName ?? "").localeCompare(b.UserName ?? "");
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const visible    = filtered.slice((safePage-1)*ITEMS_PER_PAGE, safePage*ITEMS_PER_PAGE);

  const goTo = (p) => { setPage(Math.max(1, Math.min(p, totalPages))); window.scrollTo({top:0,behavior:"smooth"}); };

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen message={error} />;

  return (
    <div className="dashboard-wrap" style={{ maxWidth:1400, margin:"0 auto", fontFamily:"'DM Sans','Segoe UI',sans-serif", position:"relative" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{ marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <span style={{ display:"inline-block", padding:"2px 12px", borderRadius:20, background:"#6366f115", border:"1px solid #6366f130", color:"#a5b4fc", fontSize:11, fontWeight:700, letterSpacing:"0.08em", marginBottom:10 }}>
              MARKETING TEAM PORTAL
            </span>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"var(--p-text)" }}>Commission Dashboard</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"var(--p-text-3)" }}>
              {mteamDoc?.name ?? mlmUser?.name}&nbsp;·&nbsp;{mteamDoc?.mobile ?? mlmUser?.mobileNo}
            </p>
            {(mteamSession?.parentName || mteamDoc?.parentName) && (
              <p style={{ margin:"8px 0 0", display:"inline-flex", flexWrap:"wrap", gap:6, padding:"6px 10px", borderRadius:9, background:"#6366f112", border:"1px solid #6366f130", fontSize:12, color:"var(--p-text-2)" }}>
                <b>Team of {mteamSession?.parentName || mteamDoc?.parentName}</b>
                <span>· Assigned commission {commPct}%</span>
                <span>· Parent bonus {mteamDoc?.uplineBonusPercentage ?? mteamSession?.uplineBonusPercentage ?? 10}% of your commission</span>
              </p>
            )}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border:`1px solid ${mteamDoc?.active ? "#10b98155" : "#ef444455"}`, fontSize:12, fontWeight:700, color: mteamDoc?.active ? "#10b981" : "#ef4444" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background: mteamDoc?.active ? "#10b981" : "#ef4444" }} />
              {mteamDoc?.active ? "Active Agent" : "Inactive"}
            </div>
            {couponDoc && (
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border:`1px solid ${couponDoc.active ? "#6366f155" : "#ef444455"}`, fontSize:12, fontWeight:700, color: couponDoc.active ? "#a5b4fc" : "#ef4444" }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background: couponDoc.active ? "#6366f1" : "#ef4444" }} />
                Coupon {couponDoc.active ? "Live" : "Disabled"}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── DASHBOARD TABS ─────────────────────────────────────────────── */}
      <div className="dash-tab-bar">
        <DashTab label="💰 Financial"      active={dashTab==="financial"}  onClick={()=>setDashTab("financial")}  accent="#f59e0b" />
        <DashTab label="👥 Referred Users" active={dashTab==="referred"}   onClick={()=>setDashTab("referred")}   accent="#6366f1" />
        <DashTab label="📋 Subscriptions"  active={dashTab==="subs"}       onClick={()=>setDashTab("subs")}       accent="#10b981" />
      </div>

      {/* ── TAB: FINANCIAL ─────────────────────────────────────────────── */}
      {dashTab === "financial" && (
        <>
          <div className="stat-grid-financial" style={{ marginBottom:22 }}>
            <StatCard icon={<IcMoney />} accent="#f59e0b" big
              label="Total Commission"
              value={fmtINR(totalCommission)}
              sub={`${commPct}% of ${fmtINR(totalRevenue)}`}
            />
            <StatCard icon={<IcNewUser />} accent="#6366f1"
              label="New Commission"
              value={fmtINR(newCommission)}
              sub="1st subscription per user"
            />
            <StatCard icon={<IcRefresh />} accent="#10b981"
              label="Renewal Commission"
              value={fmtINR(renewalCommission)}
              sub="2nd+ subscriptions per user"
            />
            <StatCard icon={<IcTag />} accent="#8b5cf6"
              label="Total Sales"
              value={subscribers.length}
              sub="via coupon code"
            />
          </div>
        </>
      )}

      {/* ── TAB: REFERRED USERS ─────────────────────────────────────────── */}
      {dashTab === "referred" && (
        <>
          <div className="stat-grid-users" style={{ marginBottom:22 }}>
            <StatCard icon={<IcUsers />} accent="#6366f1" big
              label="Total Users"
              value={totalUsers}
              sub="referred by you"
            />
            <StatCard icon={<IcStar />} accent="#10b981"
              label="Has MLM Profile"
              value={hasProfileCount}
              sub="have a profile"
            />
            <StatCard icon={<IcMinus />} accent="#94a3b8"
              label="No MLM Profile"
              value={noProfileCount}
              sub="profile not created"
            />
          </div>
        </>
      )}

      {/* ── TAB: SUBSCRIPTIONS ─────────────────────────────────────────── */}
      {dashTab === "subs" && (
        <>
          <div className="stat-grid-subs" style={{ marginBottom:22 }}>
            <StatCard icon={<IcCheckCir />} accent="#10b981" big
              label="Total Active Subscriptions"
              value={totalActiveSubs}
              sub="users with active plan"
            />
            <StatCard icon={<IcNewUser />} accent="#6366f1"
              label="New Subscription"
              value={newSubCount}
              sub="users with only 1 purchase"
            />
            <StatCard icon={<IcRefresh />} accent="#8b5cf6"
              label="Renewal Subscription"
              value={renewalSubCount}
              sub="users with 2+ purchases"
            />
            <StatCard icon={<IcClock />} accent="#ef4444"
              label="Expired Subscription"
              value={expiredSubCount}
              sub="no active plan"
            />
          </div>
        </>
      )}

      {/* ── COUPON CARD ────────────────────────────────────────────────── */}
      {couponDoc && (
        <div style={{ position:"relative", borderRadius:18, overflow:"hidden", background:"linear-gradient(135deg,var(--p-card),var(--p-card2))", border:"1px solid #6366f130", padding:"20px 24px", marginBottom:24, display:"flex", flexWrap:"wrap", gap:20, alignItems:"center" }}>
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"#6366f110", pointerEvents:"none" }} />
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontSize:10, fontWeight:700, color:"var(--p-text-4)", textTransform:"uppercase", letterSpacing:"0.08em", display:"flex", alignItems:"center", gap:4 }}><IcTicket /> YOUR COUPON CODE</span>
            <span style={{ fontSize:28, fontWeight:900, color:"#a5b4fc", letterSpacing:2 }}>{couponDoc.code}</span>
            <span style={{ fontSize:11, color:"var(--p-text-4)" }}>ID: {couponDoc.documentId}</span>
          </div>
          <div style={{ width:1, height:60, background:"var(--p-border)", flexShrink:0 }} />
          <div style={{ display:"flex", flexWrap:"wrap", gap:24 }}>
            <CouponStat label="Your Commission" value={`${commPct}%`} accent="#f59e0b" />
            <CouponStat label="User Discount"   value={`${discountPct}%`} accent="#10b981" />
            <CouponStat label="Status"           value={couponDoc.active ? "Active" : "Inactive"} accent={couponDoc.active ? "#10b981" : "#ef4444"} />
            <CouponStat label="Created"          value={couponDoc.created_at?.toDate ? couponDoc.created_at.toDate().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—"} accent="#94a3b8" />
          </div>
        </div>
      )}

      {/* ── CONTROLS ───────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"var(--p-card)", border:"1.5px solid var(--p-border)", borderRadius:10, flex:"1 1 200px", minWidth:180 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            style={{ border:"none", background:"transparent", outline:"none", color:"var(--p-text)", fontSize:13, flex:1 }}
            placeholder="Search by name or mobile…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button style={{ background:"none", border:"none", cursor:"pointer", color:"var(--p-text-4)", fontSize:13 }} onClick={() => setSearch("")}>✕</button>}
        </div>

        <div className="filter-btn-row">
          {["all","active","expired","inactive"].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)} style={{
              padding:"8px 14px", borderRadius:9, border:"1.5px solid",
              borderColor: filterStatus===f ? "#6366f1" : "var(--p-border)",
              background: filterStatus===f ? "#6366f115" : "transparent",
              color: filterStatus===f ? "#a5b4fc" : "var(--p-text-3)",
              fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
            }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>

        <select style={{ padding:"9px 12px", background:"var(--p-card)", border:"1.5px solid var(--p-border)", borderRadius:10, color:"var(--p-text)", fontSize:13, outline:"none" }}
          value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="date">↓ Latest first</option>
          <option value="amount">↓ Highest amount</option>
          <option value="name">A–Z Name</option>
        </select>
      </div>

      {/* ── SUBSCRIBER TABLE ───────────────────────────────────────────── */}
      <section>
        {visible.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX:"auto", borderRadius:14, border:"1px solid var(--p-border)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:720 }}>
              <thead>
                <tr style={{ background:"var(--p-card2)" }}>
                  {["#","Name / Mobile","Plan","Status","Amount","Commission","Purchase Date","Action"].map((h,i) => (
                    <th key={h} style={{ padding:"11px 14px", fontSize:11, fontWeight:700, color:"var(--p-text-4)", textTransform:"uppercase", letterSpacing:"0.06em", textAlign: i>=4 && i<=6 ? "right" : i===7 ? "center" : "left", borderBottom:"2px solid var(--p-border)", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((sub, i) => {
                  const badge      = statusBadge(sub);
                  const commission = Math.round((sub.PaymentAmount ?? 0) * (commPct / 100));
                  const user       = sub._user;
                  const name       = sub.UserName ?? user?.name ?? "—";
                  const date       = sub.PurchaseAt
                    ? new Date(sub.PurchaseAt?.toDate ? sub.PurchaseAt.toDate() : sub.PurchaseAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})
                    : "—";
                  return (
                    <tr key={sub.documentId} style={{ background: i%2===1 ? "var(--p-bg)" : "transparent", transition:"background 0.15s" }}>
                      <td style={{ padding:"11px 14px", fontSize:12, color:"var(--p-text-4)", width:36 }}>{(safePage-1)*ITEMS_PER_PAGE+i+1}</td>
                      <td style={{ padding:"11px 14px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14, flexShrink:0 }}>
                            {(name||"?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p style={{ margin:0, fontWeight:700, fontSize:13, color:"var(--p-text)" }}>{name}</p>
                            <p style={{ margin:0, fontSize:11, color:"var(--p-text-3)", display:"flex", alignItems:"center", gap:3 }}><IcPhone /> {sub.mobileNo}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"11px 14px" }}>
                        <span style={{ padding:"2px 10px", borderRadius:6, background:planColor(sub.plan)+"22", color:planColor(sub.plan), fontSize:11, fontWeight:700 }}>{sub.plan ?? "—"}</span>
                      </td>
                      <td style={{ padding:"11px 14px" }}>
                        <span style={{ padding:"2px 9px", borderRadius:6, background:badge.bg, color:badge.color, fontSize:11, fontWeight:700 }}>{badge.label}</span>
                      </td>
                      <td style={{ padding:"11px 14px", textAlign:"right", fontWeight:700, fontSize:13, color:"var(--p-text)" }}>{fmtINR(sub.PaymentAmount)}</td>
                      <td style={{ padding:"11px 14px", textAlign:"right", fontWeight:700, fontSize:13, color:"#10b981" }}>+{fmtINR(commission)}</td>
                      <td style={{ padding:"11px 14px", textAlign:"right", fontSize:12, color:"var(--p-text-3)" }}>{date}</td>
                      <td style={{ padding:"11px 14px", textAlign:"center" }}>
                        <button
                          onClick={() => { setSelectedSub(sub); setModalOpen(true); }}
                          style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8, border:"1.5px solid #6366f160", background:"#6366f115", color:"#a5b4fc", fontSize:12, fontWeight:700, cursor:"pointer" }}
                        >
                          <IcEye /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {filtered.length > ITEMS_PER_PAGE && (
        <Pagination page={safePage} totalPages={totalPages} total={filtered.length} perPage={ITEMS_PER_PAGE} goTo={goTo} />
      )}

      <p style={{ textAlign:"center", fontSize:12, color:"var(--p-text-4)", marginTop:16 }}>
        {filtered.length} successful subscriber{filtered.length !== 1 ? "s" : ""} total
      </p>

      {/* ── SUBSCRIBER DETAIL MODAL ────────────────────────────────────── */}
      {modalOpen && selectedSub && (() => {
        const sub   = selectedSub;
        const user  = sub._user;
        const badge = statusBadge(sub);
        const commission = Math.round((sub.PaymentAmount ?? 0) * (commPct / 100));
        const close = () => { setModalOpen(false); setSelectedSub(null); };
        return (
          <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
            onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }} onClick={close} />
            <div style={{ position:"relative", zIndex:1, background:"var(--p-card)", borderRadius:20, boxShadow:"0 24px 80px #0008", width:"100%", maxWidth:640, maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--p-border)", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:46, height:46, borderRadius:14, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:20, flexShrink:0 }}>
                  {(sub.UserName ?? user?.name ?? "?")[0].toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontWeight:800, fontSize:16, color:"var(--p-text)" }}>{sub.UserName ?? user?.name ?? "—"}</p>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:"var(--p-text-3)" }}>{sub.mobileNo}</p>
                </div>
                <span style={{ padding:"4px 12px", borderRadius:8, background:badge.bg, color:badge.color, fontSize:12, fontWeight:700 }}>{badge.label}</span>
                <button onClick={close} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--p-text-3)", fontSize:18, padding:4 }}>✕</button>
              </div>
              <div style={{ overflowY:"auto", padding:"20px 24px", display:"grid", gap:10 }}>
                {[
                  ["Plan",        sub.plan ?? "—"],
                  ["Plan Type",   sub.planType ?? "—"],
                  ["Amount Paid", fmtINR(sub.PaymentAmount)],
                  ["Commission",  `+${fmtINR(commission)}`],
                  ["Start Date",  sub.startdate ?? "—"],
                  ["Expiry Date", sub.expirydate ?? "—"],
                  ["Duration",    sub.duration ?? "—"],
                  ["Coupon Used", sub.couponApplied ?? "—"],
                  ["Order ID",    sub.OrderId ?? "—"],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid var(--p-border)" }}>
                    <span style={{ fontSize:12, color:"var(--p-text-4)", fontWeight:600 }}>{k}</span>
                    <span style={{ fontSize:13, color:"var(--p-text)", fontWeight:700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
