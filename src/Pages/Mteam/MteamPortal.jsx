// Updated MteamPortal: WhatsApp sharing includes the Google Play Install Referrer code.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../../../Firebase";
import { useMarketingAuth } from "../../Auth/MarketingAuthContext";
import MainTeam from "./MainTeam";
import TeamUserManagement from "./TeamUserManagement";
import MyMarketingTeam from "./MyMarketingTeam";
import MonthWiseReport from "./MonthWiseReport";
import LeadManagement from "./LeadManagement";
import FreshLead from "./FreshLead";
import TaskManagement from "./TaskManagement";
import { useTheme } from "../../Context/ThemeContext";
import {
  getSession,
  clearSession,
  refreshSession,
} from "../../Utils/sessionManager";
import logo from "../../../public/mlmboo2.ico";

// ── Icons ──────────────────────────────────────────────────────────────────
const IcGrid = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const IcReport = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const IcLeads = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IcFreshLead = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);
const IcTeam = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IcTasks = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 5h11M9 12h11M9 19h11" />
    <path d="m3.5 5 1 1 2-2M3.5 12l1 1 2-2M3.5 19l1 1 2-2" />
  </svg>
);
const IcLogout = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IcMenu = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IcClose = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IcSun = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const IcMoon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const IcWhatsApp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const APP_LINK =
  "https://play.google.com/store/apps/details?id=com.mlmbooster.mlmbooster";

const normalizeReferralCode = (value) => {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 8);
};

const createPlayStoreReferralLink = (referCode) => {
  const code = normalizeReferralCode(referCode);
  if (!code) return "";

  // Produces: &referrer=ref%3DBYCO9418
  return `${APP_LINK}&referrer=${encodeURIComponent(`ref=${code}`)}`;
};

const ALL_TABS = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: IcGrid },
  { id: "reports", label: "Reports", shortLabel: "Reports", icon: IcReport },
  { id: "leads", label: "Leads", shortLabel: "Leads", icon: IcLeads },
  {
    id: "freshleads",
    label: "Fresh Lead",
    shortLabel: "Fresh Lead",
    icon: IcFreshLead,
  },
  { id: "taskmanagement", label: "Task Management", shortLabel: "Tasks", icon: IcTasks },
  { id: "team", label: "My Team", shortLabel: "Team", icon: IcTeam },
  { id: "portalusers", label: "Portal Users", shortLabel: "Users", icon: IcTeam },
];

export default function MteamPortal() {
  const navigate = useNavigate();
  const { logout, session } = useMarketingAuth();
  const { theme, toggle } = useTheme();
  const [activeTab, setActiveTab] = useState(() => {
    const current = getSession();
    const allowed = current?.tabs ?? ["dashboard"];
    return allowed[0] ?? "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionExpiry] = useState(() => getSession()?._expiresAt ?? null);
  const [couponCode, setCouponCode] = useState("");
  const profileRef = useRef(null);

  useEffect(() => {
    const s = session || getSession();
    if (!s) {
      navigate("/login", { replace: true });
      return;
    }
    refreshSession();

    // Fetch coupon code for WhatsApp share
    const fetchCoupon = async () => {
      try {
        let mteamId = s.mteamId;
        let mt = null;
        if (mteamId) {
          const snap = await getDoc(doc(db, "mteam", mteamId));
          if (snap.exists()) mt = { id: snap.id, ...snap.data() };
        }
        if (!mt) {
          const mSnap = await getDocs(
            query(collection(db, "mteam"), where("mobile", "==", s.mobile)),
          );
          if (!mSnap.empty)
            mt = { id: mSnap.docs[0].id, ...mSnap.docs[0].data() };
        }
        if (!mt) return;
        let couponDoc = null;
        if (mt.assign_coupon_id) {
          try {
            const cSnap = await getDoc(
              doc(db, "couponcode", mt.assign_coupon_id),
            );
            if (cSnap.exists()) couponDoc = cSnap.data();
          } catch {
            // The assigned-user lookup below is the fallback for old records.
          }
        }
        if (!couponDoc) {
          const cSnap = await getDocs(
            query(
              collection(db, "couponcode"),
              where("assigned_user.id", "==", mt.id),
            ),
          );
          if (!cSnap.empty) couponDoc = cSnap.docs[0].data();
        }
        if (couponDoc?.code) {
          setCouponCode(normalizeReferralCode(couponDoc.code));
        }
      } catch {
        setCouponCode("");
      }
    };
    fetchCoupon();

    const extend = () => refreshSession();
    window.addEventListener("click", extend, { passive: true });
    window.addEventListener("keydown", extend, { passive: true });
    return () => {
      window.removeEventListener("click", extend);
      window.removeEventListener("keydown", extend);
    };
  }, [navigate, session]);

  // Check session validity every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (!getSession()) navigate("/login", { replace: true });
    }, 60000);
    return () => clearInterval(interval);
  }, [navigate]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handle = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!session) return null;

  const isMember = session.role === "member";
  const dataMobile = isMember
    ? session.mobile
    : (session.parentMobile ?? session.mobile);

  const allowedTabs = ALL_TABS.filter((t) => {
    if (t.id === "team" || t.id === "portalusers") return isMember;
    if (isMember) return true;
    return (session.tabs ?? ["dashboard"]).includes(t.id);
  });

  const handleLogout = async () => {
    clearSession();
    await logout();
    navigate("/login");
  };

  const switchTab = (id) => {
    setActiveTab(id);
    setSidebarOpen(false);
  };

  const handleWhatsAppShare = () => {
    const code = normalizeReferralCode(
      couponCode ||
        session?.couponCode ||
        session?.referCode ||
        session?.referralCode ||
        "",
    );

    if (!code) {
      alert(
        "Referral code अभी नहीं मिला। कृपया कुछ सेकंड बाद दोबारा Share करें।",
      );
      return;
    }

    const referralLink = createPlayStoreReferralLink(code);

    if (!referralLink) {
      alert("Referral link नहीं बन पाया। कृपया दोबारा प्रयास करें।");
      return;
    }

    const message = `
    
    🔥 MLM LIVE Offer 🔥

📢 अब बैनर बनाने के लिए पैसे खर्च करने की जरूरत नहीं!

✅ Referral Code - ${code}
✅ Referral Code डालते ही आप बना सकते है Unlimited Banner बिल्कुल Free 
    सभी Network Marketing Banner 
✅ Rank Achievement
✅ Birthday
✅ Anniversary
✅ Meeting
✅ Motivational 
✅ Festival Banner जैसे 10000 से ज़्यादा Template बिल्कुल FREE

🎁 Special Offer:
मेरे 🎁  *Referral Code: ${code}*  से Join करें और Unlimited Banner बनाएं बिना किसी Charge के।

📲 Download Now ${referralLink}
`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const renderContent = () => {
    if (activeTab === "dashboard") return <MainTeam mteamSession={session} />;
    if (activeTab === "reports")
      return <MonthWiseReport mteamId={session.mteamId} mobile={dataMobile} />;
    if (activeTab === "leads") return <LeadManagement mteamSession={session} />;
    if (activeTab === "freshleads") return <FreshLead mteamSession={session} />;
    if (activeTab === "taskmanagement") return <TaskManagement mteamSession={session} />;
    if (activeTab === "team" && isMember)
      return <MyMarketingTeam />;
    if (activeTab === "portalusers" && isMember)
      return <TeamUserManagement mteamId={session.mteamId} />;
    return (
      <div
        style={{ padding: 40, color: "var(--p-text-3)", textAlign: "center" }}
      >
        No access.
      </div>
    );
  };

  const isDark = theme === "dark";
  const activeTabInfo = ALL_TABS.find((t) => t.id === activeTab);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--p-bg)",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}
    >
      {/* ── OVERLAY (mobile sidebar) ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 90,
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
      <aside className={`mteam-sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        {/* Logo + Close btn */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 14px",
            borderBottom: "1px solid var(--p-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={logo}
              alt="logo"
              style={{ width: 32, height: 32, borderRadius: 8 }}
            />
            <span
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "#6366f1",
                letterSpacing: "-0.3px",
              }}
            >
              MLMLIVE
            </span>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--p-text-3)",
              display: "flex",
              padding: 4,
              borderRadius: 8,
            }}
          >
            <IcClose />
          </button>
        </div>

        {/* User info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--p-border)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {session.name?.[0]?.toUpperCase() ?? "M"}
          </div>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: "var(--p-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.name}
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 11,
                color: "#6366f1",
                fontWeight: 600,
              }}
            >
              {session.role === "member" ? "Marketing Member" : "Team Member"}
            </p>
          </div>
        </div>

        <p
          style={{
            margin: "14px 16px 6px",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--p-text-4)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Navigation
        </p>

        {/* Nav items */}
        <nav
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "0 8px",
            overflowY: "auto",
          }}
        >
          {allowedTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: "left",
                  transition: "all 0.15s",
                  width: "100%",
                  background: isActive ? "#6366f115" : "transparent",
                  color: isActive
                    ? isDark
                      ? "#a5b4fc"
                      : "#4f46e5"
                    : "var(--p-text-3)",
                  borderLeft: isActive
                    ? "3px solid #6366f1"
                    : "3px solid transparent",
                }}
              >
                <span
                  style={{
                    color: isActive ? "#6366f1" : "var(--p-text-4)",
                    display: "flex",
                  }}
                >
                  <Icon size={17} />
                </span>
                {tab.label}
                {isActive && (
                  <span
                    style={{
                      marginLeft: "auto",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#6366f1",
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* ── WhatsApp Share Button ─────────────────────────────────── */}
        <div
          style={{
            padding: "12px 8px 4px",
            borderTop: "1px solid var(--p-border)",
          }}
        >
          <button
            onClick={handleWhatsAppShare}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1.5px solid #25d36640",
              background: "linear-gradient(135deg,#25d36615,#128c7e10)",
              color: "#25d366",
              width: "100%",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              transition: "all 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                "linear-gradient(135deg,#25d36625,#128c7e20)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                "linear-gradient(135deg,#25d36615,#128c7e10)")
            }
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#25d36620",
                flexShrink: 0,
              }}
            >
              <IcWhatsApp />
            </span>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#25d366",
                }}
              >
                App शेयर करें
              </p>
              <p
                style={{
                  margin: "1px 0 0",
                  fontSize: 10,
                  color: "#128c7e",
                  fontWeight: 500,
                }}
              >
                {couponCode ? `Code: ${couponCode}` : "WhatsApp पर शेयर करें"}
              </p>
            </div>
          </button>
        </div>

        {/* Theme + expiry */}
        <div style={{ padding: "8px 16px 6px" }}>
          <button
            onClick={toggle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 12px",
              width: "100%",
              borderRadius: 10,
              border: "1px solid var(--p-border)",
              background: "var(--p-card2)",
              color: "var(--p-text-2)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {isDark ? <IcSun /> : <IcMoon />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
          {sessionExpiry && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 10,
                color: "var(--p-text-4)",
                textAlign: "center",
              }}
            >
              Session until{" "}
              {new Date(sessionExpiry).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Logout */}
        <div style={{ padding: "6px 8px 16px" }}>
          <button
            onClick={() => navigate("/security")}
            style={{
              display: "flex",
              padding: "11px 14px",
              marginBottom: 8,
              borderRadius: 10,
              border: "1px solid #6366f140",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#6366f1",
              background: "#6366f108",
              width: "100%",
            }}
          >
            Login Activity
          </button>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 14px",
              borderRadius: 10,
              border: "1px solid #ef444430",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#ef4444",
              background: "#ef444408",
              width: "100%",
              transition: "background 0.15s",
            }}
          >
            <IcLogout /> Logout
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <div
        className="mteam-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Top Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            height: 56,
            minHeight: 56,
            flexShrink: 0,
            borderBottom: "1px solid var(--p-border)",
            background: "var(--p-card)",
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            className="mteam-hamburger"
            onClick={() => setSidebarOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--p-text-2)",
              padding: "6px",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <IcMenu />
          </button>

          {/* Logo — mobile only */}
          <div
            className="header-logo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <img
              src={logo}
              alt=""
              style={{ width: 26, height: 26, borderRadius: 6 }}
            />
          </div>

          {/* Tab title */}
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "var(--p-text)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeTabInfo?.label ?? "Portal"}
          </span>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title="Toggle theme"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 10px",
              borderRadius: 20,
              border: "1px solid var(--p-border)",
              background: "var(--p-card2)",
              color: "var(--p-text-2)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {isDark ? <IcSun /> : <IcMoon />}
            <span className="theme-label">{isDark ? "Light" : "Dark"}</span>
          </button>

          {/* Profile dropdown — desktop */}
          <div
            ref={profileRef}
            style={{ position: "relative", flexShrink: 0 }}
            className="desktop-profile"
          >
            <button
              onClick={() => setProfileOpen((p) => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 20,
                border: "1px solid var(--p-border)",
                background: "var(--p-card2)",
                color: "var(--p-text-2)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                {session.name?.[0]?.toUpperCase()}
              </div>
              <span
                style={{
                  maxWidth: 80,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {session.name}
              </span>
            </button>
            {profileOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: "var(--p-card)",
                  border: "1px solid var(--p-border)",
                  borderRadius: 14,
                  padding: 8,
                  minWidth: 180,
                  boxShadow: "0 8px 32px #0003",
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    padding: "8px 12px 10px",
                    borderBottom: "1px solid var(--p-border)",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      fontSize: 13,
                      color: "var(--p-text)",
                    }}
                  >
                    {session.name}
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 11,
                      color: "var(--p-text-4)",
                    }}
                  >
                    {session.mobile}
                  </p>
                  {sessionExpiry && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 10,
                        color: "var(--p-text-4)",
                      }}
                    >
                      Session until{" "}
                      {new Date(sessionExpiry).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    width: "100%",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#ef4444",
                    background: "transparent",
                    textAlign: "left",
                  }}
                >
                  <IcLogout /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <div
          style={{ flex: 1, overflowY: "auto", background: "var(--p-bg)" }}
          className="mteam-content"
        >
          {renderContent()}
        </div>

        {/* ── BOTTOM NAV (mobile only) ──────────────────────────────── */}
        <nav className="mteam-bottom-nav">
          {allowedTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "8px 4px",
                  border: "none",
                  background: "transparent",
                  color: isActive ? "#6366f1" : "var(--p-text-4)",
                  cursor: "pointer",
                  transition: "color 0.15s",
                  position: "relative",
                }}
              >
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 24,
                      height: 3,
                      borderRadius: "0 0 4px 4px",
                      background: "#6366f1",
                    }}
                  />
                )}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: isActive ? "#6366f115" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <Icon size={19} />
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: "0.01em",
                  }}
                >
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── RESPONSIVE STYLES ────────────────────────────────────────── */}
      <style>{`
        /* ── Sidebar: hidden by default on mobile ─────── */
        .mteam-sidebar {
          width: 260px;
          flex-shrink: 0;
          background: var(--p-card);
          border-right: 1px solid var(--p-border);
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 100;
          transform: translateX(-100%);
          transition: transform 0.28s cubic-bezier(.4,0,.2,1);
          box-shadow: 4px 0 24px rgba(0,0,0,0.12);
        }
        .mteam-sidebar.sidebar-open {
          transform: translateX(0);
        }

        /* ── Bottom nav: mobile only ──────────────────── */
        .mteam-bottom-nav {
          display: flex;
          align-items: stretch;
          background: var(--p-card);
          border-top: 1px solid var(--p-border);
          height: 64px;
          min-height: 64px;
          flex-shrink: 0;
          padding: 0 4px;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }

        /* Mobile-only elements */
        .mteam-hamburger { display: flex !important; }
        .header-logo     { display: flex !important; }
        .desktop-profile { display: none !important; }
        .sidebar-close-btn { display: flex !important; }
        .theme-label     { display: none; }

        /* ── Desktop (≥768px) ─────────────────────────── */
        @media (min-width: 768px) {
          .mteam-sidebar {
            transform: translateX(0) !important;
            position: relative !important;
            box-shadow: none;
          }
          .sidebar-close-btn { display: none !important; }
          .mteam-bottom-nav  { display: none !important; }
          .mteam-hamburger   { display: none !important; }
          .header-logo       { display: none !important; }
          .desktop-profile   { display: block !important; }
          .theme-label       { display: inline !important; }
          .mteam-content     { padding-bottom: 0 !important; }
        }

        /* ── Responsive dashboard cards ──────────────── */
        .stat-grid-financial,
        .stat-grid-users,
        .stat-grid-subs {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 480px) {
          .stat-grid-financial { grid-template-columns: repeat(2, 1fr); }
          .stat-grid-users     { grid-template-columns: repeat(3, 1fr); }
          .stat-grid-subs      { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 768px) {
          .stat-grid-financial { grid-template-columns: repeat(4, 1fr); }
          .stat-grid-users     { grid-template-columns: repeat(3, 1fr); }
          .stat-grid-subs      { grid-template-columns: repeat(4, 1fr); }
        }
        @media (min-width: 1024px) {
          .stat-grid-financial { grid-template-columns: repeat(4, 1fr); }
          .stat-grid-subs      { grid-template-columns: repeat(4, 1fr); }
        }

        /* ── Dashboard padding ────────────────────────── */
        .dashboard-wrap { padding: 14px 12px; }
        @media (min-width: 640px) { .dashboard-wrap { padding: 20px 24px; } }

        /* ── Lead Management ──────────────────────────── */
        .lead-wrap { padding: 14px 12px; }
        @media (min-width: 640px) { .lead-wrap { padding: 20px 24px; } }

        .lead-date-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: flex-end;
        }
        .lead-date-input {
          flex: 1 1 130px;
          min-width: 130px;
        }
        .lead-filters-scroll {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        @media (max-width: 639px) {
          .lead-filters-scroll {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 4px;
            -webkit-overflow-scrolling: touch;
          }
          .lead-filters-scroll::-webkit-scrollbar { height: 3px; }
          .lead-filters-scroll::-webkit-scrollbar-thumb { background: var(--p-border); border-radius: 4px; }
        }

        /* ── Mobile card view for leads table ────────── */
        .leads-table-wrap { display: none; }
        .leads-card-list  { display: flex; flex-direction: column; gap: 10px; }
        @media (min-width: 768px) {
          .leads-table-wrap { display: block; }
          .leads-card-list  { display: none; }
        }

        /* ── Mobile subscriber table ──────────────────── */
        .sub-table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid var(--p-border); }
        .sub-table-wrap table { min-width: 660px; }

        /* ── Coupon card flex ─────────────────────────── */
        .coupon-card-inner {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
        }
        .coupon-divider { display: none; }
        @media (min-width: 560px) { .coupon-divider { display: block; } }

        /* ── Header filter buttons ────────────────────── */
        .filter-btn-row {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
          -webkit-overflow-scrolling: touch;
          flex-shrink: 0;
        }
        .filter-btn-row::-webkit-scrollbar { height: 2px; }
        .filter-btn-row button { flex-shrink: 0; }

        /* ── Dashboard tabs ───────────────────────────── */
        .dash-tab-bar {
          display: flex;
          gap: 4px;
          background: var(--p-card);
          border: 1px solid var(--p-border);
          border-radius: 14px;
          padding: 5px;
          margin-bottom: 20px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .dash-tab-bar::-webkit-scrollbar { height: 2px; }
        .dash-tab-btn {
          flex: 1;
          min-width: 90px;
          padding: 9px 14px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          transition: all 0.18s;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
