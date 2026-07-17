import {

  CircleCheck,
  Clock,
  CircleXmark,
} from "@gravity-ui/icons";

// ── Static data ─────────────────────────────────────────────────────────────

const STATS = [
  {
    id: "revenue",
    label: "Total Revenue",
    value: "$48,295",
    change: "+12.5%",
    up: true,
    icon: "",
    iconBg: "bg-violet-50 dark:bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
 
];

const CHART = [
  { month: "Jan", orders: 65, revenue: 42 },
  { month: "Feb", orders: 78, revenue: 55 },
  { month: "Mar", orders: 55, revenue: 38 },
  { month: "Apr", orders: 90, revenue: 72 },
  { month: "May", orders: 68, revenue: 60 },
  { month: "Jun", orders: 95, revenue: 85 },
  { month: "Jul", orders: 82, revenue: 68 },
  { month: "Aug", orders: 100, revenue: 92 },
];

const TRANSACTIONS = [
  { id: "#TXN-001", user: "Arjun Sharma",  initials: "AS", amount: "+$240", status: "completed", time: "2 min ago" },
  { id: "#TXN-002", user: "Priya Mehta",   initials: "PM", amount: "+$85",  status: "pending",   time: "14 min ago" },
  { id: "#TXN-003", user: "Rahul Singh",   initials: "RS", amount: "+$530", status: "completed", time: "1 hr ago" },
  { id: "#TXN-004", user: "Sneha Patil",   initials: "SP", amount: "-$120", status: "failed",    time: "3 hr ago" },
  { id: "#TXN-005", user: "Vikram Nair",   initials: "VN", amount: "+$310", status: "completed", time: "5 hr ago" },
];

const TOP_MEMBERS = [
  { name: "Arjun Sharma", referrals: 48, earnings: "$2,840", level: 5 },
  { name: "Priya Mehta",  referrals: 35, earnings: "$1,960", level: 4 },
  { name: "Rahul Singh",  referrals: 29, earnings: "$1,450", level: 3 },
  { name: "Sneha Patil",  referrals: 22, earnings: "$1,120", level: 3 },
];

const AVATAR_COLORS = [
  "from-violet-500 to-indigo-600",
  "from-sky-400 to-blue-500",
  "from-pink-400 to-rose-500",
  "from-amber-400 to-orange-400",
  "from-teal-400 to-emerald-500",
];

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_ICON = {
  completed: <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />,
  pending:   <Clock        className="w-3.5 h-3.5 text-amber-500"  />,
  failed:    <CircleXmark  className="w-3.5 h-3.5 text-red-400"    />,
};

const STATUS_STYLE = {
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  pending:   "bg-amber-50  text-amber-600   dark:bg-amber-500/10   dark:text-amber-400",
  failed:    "bg-red-50    text-red-500     dark:bg-red-500/10     dark:text-red-400",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const maxOrders = Math.max(...CHART.map((d) => d.orders));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Welcome banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-700 p-6 text-white shadow-xl shadow-violet-500/20">
        <div className="relative z-10">
          <p className="text-violet-200 text-sm font-medium mb-1">Good Morning 👋</p>
          <h2
            className="text-2xl font-bold mb-1"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Welcome back, Admin!
          </h2>
          <p className="text-violet-200 text-sm">
            Here's what's happening with your MLM network today.
          </p>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -right-4 -bottom-12 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute right-28 -top-6 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
      </div>

     

    </div>
  );
}