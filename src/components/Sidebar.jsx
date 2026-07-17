import { Dots9, Hand } from "@gravity-ui/icons";
import { useNavigate } from "react-router";
import logo from "../../public/mlmboo2.ico";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.mlmbooster.mlmbooster";

const ShareIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 10.5 6.8-4" />
    <path d="m8.6 13.5 6.8 4" />
  </svg>
);

const NAV_ITEMS = [
  {
    icon: Dots9,
    label: "Dashboard",
    id: "dashboard",
    link: "/",
  },
];

const BOTTOM_ITEMS = [
  {
    icon: ShareIcon,
    label: "Share App",
    id: "share",
  },
  {
    icon: Hand,
    label: "Logout",
    id: "logout",
  },
];

const normalizeReferralCode = (value) => {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 8);
};

const getMarketingUser = () => {
  try {
    const savedUser = localStorage.getItem("usermlm");

    if (!savedUser) return null;

    return JSON.parse(savedUser);
  } catch {
    return null;
  }
};

const findReferralCode = (value, depth = 0) => {
  if (!value || depth > 5) return "";

  if (typeof value === "string") {
    try {
      return findReferralCode(JSON.parse(value), depth + 1);
    } catch {
      return "";
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const code = findReferralCode(item, depth + 1);

      if (code) return code;
    }

    return "";
  }

  if (typeof value !== "object") return "";

  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");

    const isReferralField =
      normalizedKey === "refercode" ||
      normalizedKey === "refcode" ||
      normalizedKey === "referralcode" ||
      normalizedKey === "couponcode" ||
      normalizedKey === "myrefercode" ||
      normalizedKey === "myreferralcode";

    if (isReferralField) {
      const code = normalizeReferralCode(String(fieldValue ?? ""));

      if (code) return code;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === "object") {
      const code = findReferralCode(nestedValue, depth + 1);

      if (code) return code;
    }
  }

  return "";
};

const getUserReferralCode = () => {
  const savedUser = getMarketingUser();

  return findReferralCode(savedUser);
};

const createPlayStoreReferralLink = (referCode) => {
  const code = normalizeReferralCode(referCode);

  if (!code) return "";

  /*
   * It will generate:
   *
   * https://play.google.com/store/apps/details
   * ?id=com.mlmbooster.mlmbooster
   * &referrer=ref%3DBYCO9418
   */
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`ref=${code}`)}`;
};

const copyShareMessage = async (message) => {
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");

      textarea.value = message;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      document.execCommand("copy");

      document.body.removeChild(textarea);

      return true;
    } catch {
      return false;
    }
  }
};

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  active,
  setActive,
}) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("usermlm");
    navigate("/login");
  };

  const handleNav = (id) => {
    setActive(id);
    setMobileOpen(false);
  };

  const handleNavigationClick = (id, link) => {
    navigate(link);
    handleNav(id);
  };

  const handleShareApp = async () => {
    const referCode = getUserReferralCode();

    /*
     * Do not share a normal Play Store link if the
     * referral code is not available.
     */
    if (!referCode) {
      alert(
        "Referral code not found. Please login again or check your marketing profile.",
      );
      return;
    }

    const referralLink = createPlayStoreReferralLink(referCode);

    if (!referralLink.includes("&referrer=ref%3D")) {
      alert("Referral link could not be created. Please try again.");
      return;
    }

    const shareMessage =
      `🌟 Join MLM LIVE & Grow Your Network!\n\n` +
      `Create professional MLM marketing banners, posters and social media designs easily.\n\n` +
      `🎁 Use my referral code: ${referCode}\n\n` +
      `📲 Download MLM LIVE from Play Store:\n` +
      `${referralLink}`;

    /*
     * MLM LIVE React Native WebView share.
     */
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "SHARE_SOMETHING",
          title: "MLM LIVE",
          message: shareMessage,
          text: shareMessage,
          url: referralLink,
        }),
      );

      setMobileOpen(false);
      return;
    }

    /*
     * Browser native share.
     *
     * URL is intentionally kept inside the text.
     * A separate URL field may remove referral parameters
     * in some Android browsers/share targets.
     */
    if (navigator.share) {
      try {
        await navigator.share({
          title: "MLM LIVE",
          text: shareMessage,
        });

        setMobileOpen(false);
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
      }
    }

    /*
     * Clipboard fallback.
     */
    const copied = await copyShareMessage(shareMessage);

    if (copied) {
      alert(`Referral link copied successfully!\n\n${referralLink}`);
    } else {
      alert(`Please copy this referral link:\n\n${referralLink}`);
    }

    setMobileOpen(false);
  };

  const handleBottomItem = (id) => {
    if (id === "share") {
      handleShareApp();
      return;
    }

    if (id === "logout") {
      handleLogout();
      return;
    }

    handleNav(id);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed md:relative top-0 left-0 z-50 md:z-auto",
          "h-full flex flex-col",
          "bg-white dark:bg-[#0f1117]",
          "border-r border-gray-100 dark:border-gray-800/70",
          "transition-all duration-300 ease-in-out",
          "shadow-xl md:shadow-none overflow-hidden",
          collapsed ? "md:w-[72px]" : "md:w-60",
          mobileOpen
            ? "w-60 translate-x-0"
            : "w-60 -translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-[18px] border-b border-gray-100 dark:border-gray-800/70">
          <div className="min-w-[36px] w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
            <img
              src={logo}
              alt="MLM LIVE"
              className="w-full h-full object-contain"
            />
          </div>

          <span
            className={[
              "font-bold text-[17px] text-gray-900 dark:text-white tracking-tight whitespace-nowrap transition-all duration-300",
              collapsed
                ? "md:opacity-0 md:w-0 md:overflow-hidden"
                : "opacity-100",
            ].join(" ")}
            style={{
              fontFamily: "'Syne', sans-serif",
            }}
          >
            <span className="text-violet-500">MLMLIVE</span>
          </span>

          <button
            type="button"
            aria-label="Close menu"
            className="ml-auto md:hidden text-accent hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            ✕
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          <p
            className={[
              "text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-600 px-3 mb-2 transition-all duration-200 whitespace-nowrap",
              collapsed
                ? "md:opacity-0 md:h-0 md:mb-0 md:overflow-hidden"
                : "opacity-100",
            ].join(" ")}
          >
            Menu
          </p>

          {NAV_ITEMS.map(({ icon: Icon, label, id, badge, link }) => {
            const isActive = active === id;

            return (
              <button
                type="button"
                key={id}
                onClick={() => handleNavigationClick(id, link)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200",
                ].join(" ")}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-violet-500 rounded-r-full" />
                )}

                <span
                  className={[
                    "min-w-[20px] flex-shrink-0 transition-colors",
                    isActive
                      ? "text-violet-500"
                      : "group-hover:text-violet-400",
                  ].join(" ")}
                >
                  <Icon className="w-5 h-5" />
                </span>

                <span
                  className={[
                    "flex-1 text-left whitespace-nowrap transition-all duration-300",
                    collapsed
                      ? "md:opacity-0 md:w-0 md:overflow-hidden"
                      : "opacity-100",
                  ].join(" ")}
                >
                  {label}
                </span>

                {badge && !collapsed && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white min-w-[18px] text-center leading-none">
                    {badge}
                  </span>
                )}

                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg hidden md:flex items-center gap-1.5">
                    {label}

                    {badge && (
                      <span className="px-1 py-0.5 bg-violet-500 rounded-full text-[9px] leading-none">
                        {badge}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-gray-100 dark:border-gray-800/70 px-2 py-3 space-y-0.5">
          {BOTTOM_ITEMS.map(({ icon: Icon, label, id }) => {
            const isActive = active === id;
            const isLogout = id === "logout";
            const isShare = id === "share";

            return (
              <button
                type="button"
                key={id}
                onClick={() => handleBottomItem(id)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isLogout
                    ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                    : isShare
                      ? "text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                      : isActive
                        ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-200",
                ].join(" ")}
              >
                <span className="min-w-[20px] flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </span>

                <span
                  className={[
                    "flex-1 text-left whitespace-nowrap transition-all duration-300",
                    collapsed
                      ? "md:opacity-0 md:w-0 md:overflow-hidden"
                      : "opacity-100",
                  ].join(" ")}
                >
                  {label}
                </span>

                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg hidden md:block">
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
