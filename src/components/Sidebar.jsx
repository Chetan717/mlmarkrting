import {
  Dots9,
  Hand,
  ChartAreaStacked,
  Person,
  LogoMicrosoftOffice,
  LayoutHeaderColumns,
  GeoPolygons,
  ChartTreemap,
  Sack,
} from "@gravity-ui/icons";
import { useNavigate } from "react-router";
import logo from "../../public/mlmboo2.ico";
const NAV_ITEMS = [
  { icon: Dots9, label: "Dashboard", id: "dashboard", link: "/" },
// {
//     icon: ChartTreemap,
//     label: "Marketing",
//     id: "marketing",
//     link: "/marketing",
//   }
  // { icon: Person, label: "Users", id: "users", link: "/users" },
  // { icon: Sack, label: "Payments", id: "payments", link: "/payments" },
];

const BOTTOM_ITEMS = [
  { icon: Hand, label: "Logout", id: "logout" },
];

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  active,
  setActive,
}) {
  const navigate = useNavigate();

  const handleLogou = () => {
    localStorage.removeItem("usermlm"); // clears your token
    navigate("/login"); // instant redirect
  };
  const handleNav = (id) => {
    setActive(id);
    setMobileOpen(false);
  };

  const hanClick = (id, link) => {
    navigate(link);
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
        {/* ── Logo row ── */}
        <div className="flex items-center gap-3 px-4 py-[18px] border-b border-gray-100 dark:border-gray-800/70">
          {/* Icon mark */}
          <div className="min-w-[36px] w-9 h-9 rounded-xl  flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
            <img src={logo} />
          </div>

          {/* Brand name */}
          <span
            className={[
              "font-bold text-[17px] text-gray-900 dark:text-white tracking-tight whitespace-nowrap transition-all duration-300",
              collapsed
                ? "md:opacity-0 md:w-0 md:overflow-hidden"
                : "opacity-100",
            ].join(" ")}
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            <span className="text-violet-500">MLMLIVE</span>
          </span>

          {/* Mobile close button */}
          <button
            className="ml-auto md:hidden text-accent hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            {/* <ArrowLeft className="w-[18px] h-[18px]" /> */}
          </button>
        </div>

        {/* ── Main nav ── */}
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
                key={id}
                onClick={() => hanClick(id, link)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200",
                ].join(" ")}
              >
                {/* Active left bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-violet-500 rounded-r-full" />
                )}

                {/* Icon */}
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

                {/* Label */}
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

                {/* Badge */}
                {badge && !collapsed && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white min-w-[18px] text-center leading-none">
                    {badge}
                  </span>
                )}

                {/* Tooltip (collapsed desktop) */}
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

        {/* ── Bottom actions ── */}
        <div className="border-t border-gray-100 dark:border-gray-800/70 px-2 py-3 space-y-0.5">
          {BOTTOM_ITEMS.map(({ icon: Icon, label, id }) => {
            const isActive = active === id;
            const isLogout = id === "logout";
            return (
              <button
                key={id}
                onClick={isLogout ? handleLogou : () => handleNav(id)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                  isLogout
                    ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                    : isActive
                      ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-200",
                ].join(" ")}
              >
                <span className="min-w-[20px] flex-shrink-0">
                  {/* <Icon className="w-5 h-5" /> */}
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

          {/* User strip */}
          
        </div>
      </aside>
    </>
  );
}
