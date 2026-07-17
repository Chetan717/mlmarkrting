export default function Paginator({ total, page, perPage, onChange, accent = "#6366f1" }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  const getPages = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const IcChevLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  );
  const IcChevRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  );

  const btn = (content, target, disabled, isActive = false) => (
    <button
      key={`${target}-${isActive}`}
      disabled={disabled}
      onClick={() => !disabled && onChange(target)}
      style={{
        minWidth: 34, height: 34, padding: "0 8px",
        border: `1.5px solid ${isActive ? accent : "var(--p-border)"}`,
        borderRadius: 8,
        background: isActive ? accent : "var(--p-card)",
        color: isActive ? "#fff" : disabled ? "var(--p-text-4)" : "var(--p-text-2)",
        fontSize: 13, fontWeight: isActive ? 800 : 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10, marginTop: 20, padding: "14px 18px",
      background: "var(--p-card)", border: "1px solid var(--p-border)", borderRadius: 12,
    }}>
      <span style={{ fontSize: 12, color: "var(--p-text-3)", whiteSpace: "nowrap" }}>
        Showing <strong style={{ color: "var(--p-text-2)" }}>{from}–{to}</strong> of{" "}
        <strong style={{ color: "var(--p-text-2)" }}>{total}</strong> results
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {btn(<IcChevLeft />, page - 1, page === 1)}
        {getPages().map((p, i) =>
          p === "..."
            ? <span key={`ellipsis-${i}`} style={{ color: "var(--p-text-4)", padding: "0 4px", fontSize: 13 }}>…</span>
            : btn(p, p, false, p === page)
        )}
        {btn(<IcChevRight />, page + 1, page === totalPages)}
      </div>
    </div>
  );
}
