export default function PanelSessionLoading({ error, retry }) {
  return <div role="status" style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 14, padding: 24, textAlign: "center", background: "#0b1120", color: "#e2e8f0" }}>
    <p>{error || "Checking secure session…"}</p>
    {error && <button type="button" onClick={retry} style={{ padding: 12, borderRadius: 9, border: 0, background: "#6366f1", color: "white", cursor: "pointer" }}>Retry</button>}
  </div>;
}
