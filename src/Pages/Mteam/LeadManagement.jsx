import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, getDocs, query, where, doc, setDoc,
  serverTimestamp, Timestamp, orderBy, limit,
} from "firebase/firestore";
import { db, functions } from "../../../Firebase";
import { httpsCallable } from "firebase/functions";
import { COLL } from "../../Utils/collections";
import { getSession } from "../../Utils/sessionManager";

// ── helpers ────────────────────────────────────────────────────────────────
const MONTHS_MAP = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDMY(str) {
  if (!str || typeof str !== "string") return null;
  str = str.trim();
  const mname = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (mname) {
    const d = Number(mname[1]), m = MONTHS_MAP[mname[2].toLowerCase().slice(0, 3)], y = Number(mname[3]);
    if (d && m !== undefined && y) return new Date(y, m, d);
  }
  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}
function daysLeft(expiryStr) {
  const exp = parseDMY(expiryStr);
  if (!exp) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}
function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function daysAgoStr(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function sanitize(v) {
  if (typeof v !== "string") return v ?? "";
  return v.replace(/<[^>]*>/g, "").trim().slice(0, 500);
}

// ── constants ──────────────────────────────────────────────────────────────
const LEAD_STATUSES = ["New", "Lost", "Renewal Follow Up", "Follow Up"];
const PAGE_SIZE = 15;
const LEAD_STATUS_COLORS = {
  "New": { color: "#6366f1", bg: "#6366f115" },
  "Lost": { color: "#64748b", bg: "#64748b15" },
  "Renewal Follow Up": { color: "#f59e0b", bg: "#f59e0b15" },
  "Follow Up": { color: "#8b5cf6", bg: "#8b5cf615" },
};

// Early expiry threshold — show as lead if expiring within this many days
const EARLY_EXPIRY_DAYS = 30;

// Is this user a valid lead? (no active plan / expired / expiring soon)
function isValidLead(subscription) {
  if (!subscription) return true;       // No plan → New user lead
  if (subscription.Expire) return true; // Expired → needs renewal
  if (!subscription.Active) return true; // Inactive
  const dl = daysLeft(subscription.expirydate);
  if (dl !== null && dl <= EARLY_EXPIRY_DAYS) return true; // Early expiry
  return false; // Active with time left → not a lead
}

// ── SVG Icons ──────────────────────────────────────────────────────────────
const IcPhone = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.14-1.93a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.6z" /></svg>;
const IcWhatsapp = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.556 4.121 1.523 5.849L.057 23.97l6.29-1.647A11.956 11.956 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm.029 21.818a9.841 9.841 0 0 1-5.012-1.366l-.36-.214-3.732.978.994-3.634-.235-.374A9.831 9.831 0 0 1 2.18 12c0-5.432 4.418-9.849 9.849-9.849 5.432 0 9.849 4.417 9.849 9.849 0 5.432-4.417 9.818-9.849 9.818z" /></svg>;
const IcEdit = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IcEye = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const IcEyeOff = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
const IcDownload = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IcRefresh = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.9" /></svg>;
const IcX = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IcCheck = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
const IcClock = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IcChevL = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IcChevR = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
const IcSearch = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const IcUsers = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;

// ── sub-components ─────────────────────────────────────────────────────────
function LeadStatusBadge({ status }) {
  const c = LEAD_STATUS_COLORS[status] ?? { color: "#94a3b8", bg: "#94a3b815" };
  return (
    <span style={{ padding: "2px 9px", borderRadius: 6, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {status || "New"}
    </span>
  );
}

function DaysLeftBadge({ days }) {
  if (days === null || days === undefined) return <span style={{ color: "var(--p-text-4)", fontSize: 12 }}>—</span>;
  let color = "#10b981", bg = "#10b98115";
  if (days <= 0) { color = "#ef4444"; bg = "#ef444415"; }
  else if (days <= 7) { color = "#ef4444"; bg = "#ef444415"; }
  else if (days <= 15) { color = "#f59e0b"; bg = "#f59e0b15"; }
  return (
    <span style={{ padding: "2px 9px", borderRadius: 6, background: bg, color, fontSize: 11, fontWeight: 700 }}>
      {days <= 0 ? "Expired" : `${days}d`}
    </span>
  );
}

function PlanStatusBadge({ subscription }) {
  if (!subscription) return <span style={{ padding: "2px 9px", borderRadius: 6, background: "#94a3b815", color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>No Plan</span>;
  if (subscription.Active && !subscription.Expire) return <span style={{ padding: "2px 9px", borderRadius: 6, background: "#10b98115", color: "#10b981", fontSize: 11, fontWeight: 700 }}>Active</span>;
  if (subscription.Expire) return <span style={{ padding: "2px 9px", borderRadius: 6, background: "#ef444415", color: "#ef4444", fontSize: 11, fontWeight: 700 }}>Expired</span>;
  return <span style={{ padding: "2px 9px", borderRadius: 6, background: "#f59e0b15", color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>Inactive</span>;
}

function PasswordValue({ value, revealed, onToggle }) {
  const password = typeof value === "string" ? value : "";
  if (!password) return <span style={{ color: "var(--p-text-4)", fontSize: 12 }}>—</span>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 118 }}>
      <span
        title={revealed ? password : "Password hidden"}
        style={{
          color: "var(--p-text-3)", fontFamily: "monospace", fontSize: 12,
          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {revealed ? password : "••••••••"}
      </span>
      <button
        type="button"
        onClick={onToggle}
        title={revealed ? "Hide password" : "Show password"}
        aria-label={revealed ? "Hide password" : "Show password"}
        style={{
          width: 28, height: 28, flexShrink: 0, display: "inline-flex", alignItems: "center",
          justifyContent: "center", borderRadius: 8, cursor: "pointer",
          background: "#6366f115", color: "#a5b4fc", border: "1px solid #6366f130",
        }}
      >
        {revealed ? <IcEyeOff /> : <IcEye />}
      </button>
    </div>
  );
}

// "Renewal" badge shown when user has expired subscription
function RenewalBadge() {
  return (
    <span style={{ padding: "2px 8px", borderRadius: 6, background: "#f59e0b20", color: "#f59e0b", fontSize: 10, fontWeight: 800, border: "1px solid #f59e0b40", letterSpacing: "0.04em" }}>
      RENEWAL
    </span>
  );
}

// ── Follow-up Modal ────────────────────────────────────────────────────────
function FollowupModal({ lead, onClose, onSave, session }) {
  const existing = lead.followup;
  const [status, setStatus] = useState(existing?.leadStatus ?? "New");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("add");

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    await onSave({ leadStatus: status, note: sanitize(note), nextFollowupDate: nextDate || null });
    setSaving(false);
    onClose();
  };

  const history = existing?.history ?? [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 1, background: "var(--p-card)", borderRadius: 20, boxShadow: "0 24px 80px #0009", width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "var(--p-text)", display: "flex", alignItems: "center", gap: 8 }}>
              Follow-up — {lead.user.name}
              {lead.subscription?.Expire && <RenewalBadge />}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--p-text-3)" }}>{lead.user.mobileNo}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text-3)", display: "flex", padding: 4 }}><IcX /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 22px", borderBottom: "1px solid var(--p-border)" }}>
          {["add", "history"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: "transparent", color: tab === t ? "#6366f1" : "var(--p-text-3)",
              borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              {t === "add" ? "Add Follow-up" : `History (${history.length})`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          {tab === "add" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lead Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} style={{
                  width: "100%", padding: "10px 12px", background: "var(--p-card2)",
                  border: "1.5px solid var(--p-border)", borderRadius: 10,
                  color: "var(--p-text)", fontSize: 14, outline: "none",
                }}>
                  {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Follow-up Note *</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value.slice(0, 500))}
                  placeholder="Write your follow-up note here…"
                  rows={4}
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--p-card2)",
                    border: "1.5px solid var(--p-border)", borderRadius: 10,
                    color: "var(--p-text)", fontSize: 14, outline: "none",
                    resize: "vertical", boxSizing: "border-box",
                  }}
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--p-text-4)", textAlign: "right" }}>{note.length}/500</p>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Next Follow-up Date</label>
                <input
                  type="date"
                  value={nextDate}
                  min={todayStr()}
                  onChange={e => setNextDate(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--p-card2)",
                    border: "1.5px solid var(--p-border)", borderRadius: 10,
                    color: "var(--p-text)", fontSize: 14, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !note.trim()}
                style={{
                  padding: "12px", borderRadius: 12, border: "none",
                  background: saving || !note.trim() ? "#4338ca60" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving || !note.trim() ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {saving ? "Saving…" : <><IcCheck /> Save Follow-up</>}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {history.length === 0 ? (
                <p style={{ color: "var(--p-text-4)", textAlign: "center", padding: "24px 0", fontSize: 14 }}>No follow-up history yet.</p>
              ) : (
                [...history].reverse().map((h, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: "var(--p-card2)", borderRadius: 12, borderLeft: "3px solid #6366f1" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <LeadStatusBadge status={h.leadStatus} />
                      <span style={{ fontSize: 11, color: "var(--p-text-4)" }}>
                        <IcClock /> {h.addedAt ? new Date(h.addedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--p-text)", lineHeight: 1.5 }}>{h.note}</p>
                    {h.nextFollowupDate && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#8b5cf6" }}>
                        <IcClock /> Next: {new Date(h.nextFollowupDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--p-text-4)" }}>By: {h.addedBy}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── View Detail Modal ──────────────────────────────────────────────────────
function ViewModal({ lead, onClose, onFollowup }) {
  const { user, subscription, mlmProfile, followup } = lead;
  const days = subscription ? daysLeft(subscription.expirydate) : null;

  const Row = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--p-border)" }}>
      <span style={{ fontSize: 12, color: "var(--p-text-4)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--p-text)", fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value ?? "—"}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 1, background: "var(--p-card)", borderRadius: 20, boxShadow: "0 24px 80px #0009", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--p-card)", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>
              {(user.name || "?")[0].toUpperCase()}
            </div>
            {/* Joined date */}

            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "var(--p-text)", display: "flex", alignItems: "center", gap: 8 }}>
                {user.name}
                {subscription?.Expire && <RenewalBadge />}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--p-text-3)" }}>{user.mobileNo}</p>
              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "var(--p-card2)", color: "var(--p-text-3)", border: "1px solid var(--p-border)" }}>
                📅 {user.createdAt?.toDate
                  ? user.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text-3)", display: "flex", padding: 4 }}><IcX /></button>
        </div>

        <div style={{ padding: "16px 22px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>User Info</p>
          <Row label="Name" value={user.name} />
          {/* Joined date */}

          <Row label="Mobile" value={user.mobileNo} />
          <Row label="Referred By" value={user.referredBy} />
          <Row label="Verified" value={user.isverified ? "Yes" : "No"} />
          <Row label="Joined" value={user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : (user.createdAt ?? "—")} />

          {subscription && (
            <>
              <p style={{ margin: "16px 0 10px", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Subscription {subscription.Expire && <span style={{ color: "#f59e0b", marginLeft: 6 }}>(Expired — Renewal Needed)</span>}
              </p>
              <Row label="Plan" value={subscription.plan} />
              <Row label="Plan Type" value={subscription.planType} />
              <Row label="Amount Paid" value={`₹${Number(subscription.PaymentAmount || 0).toLocaleString("en-IN")}`} />
              <Row label="Start Date" value={subscription.startdate} />
              <Row label="Expiry Date" value={subscription.expirydate} />
              <Row label="Days Left" value={days !== null ? (days <= 0 ? "Expired" : `${days} days`) : "—"} />
              <Row label="Status" value={subscription.Active && !subscription.Expire ? "Active" : subscription.Expire ? "Expired" : "Inactive"} />
              <Row label="Coupon Used" value={subscription.couponApplied} />
            </>
          )}

          {mlmProfile && (
            <>
              <p style={{ margin: "16px 0 10px", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>MLM Profile</p>
              <Row label="Full Name" value={mlmProfile.fullName} />
              <Row label="Company" value={mlmProfile.companyName} />
              <Row label="Designation" value={mlmProfile.designation} />
            </>
          )}

          {followup && (
            <>
              <p style={{ margin: "16px 0 10px", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lead Status</p>
              <Row label="Status" value={<LeadStatusBadge status={followup.leadStatus} />} />
              <Row label="Last Note" value={followup.lastFollowupNote} />
              <Row label="Next Follow-up" value={followup.nextFollowupDate} />
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <a href={`tel:${user.mobileNo}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, background: "#10b98115", color: "#10b981", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1px solid #10b98130" }}>
              <IcPhone /> Call
            </a>
            <a href={`https://wa.me/91${user.mobileNo}`} target="_blank" rel="noreferrer" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, background: "#25D36615", color: "#25D366", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1px solid #25D36630" }}>
              <IcWhatsapp /> WhatsApp
            </a>
            <button onClick={() => { onClose(); onFollowup(); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, background: "#6366f115", color: "#a5b4fc", fontSize: 13, fontWeight: 700, border: "1px solid #6366f130", cursor: "pointer" }}>
              <IcEdit /> Follow-up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export default function LeadManagement({ mteamSession }) {
  const session = mteamSession ?? getSession();
  const mteamId = session?.mteamId;

  const [mteamDoc, setMteamDoc] = useState(null);
  const [couponCode, setCouponCode] = useState(null);
  const [leads, setLeads] = useState([]);
  const [followups, setFollowups] = useState({});
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);
  const [mlmCompanies, setMlmCompanies] = useState([]);

  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());

  const [filters, setFilters] = useState({
    search: "", leadStatus: "all", planStatus: "all",
    mlmProfile: "all", expiringIn: "all", company: "all",
  });
  const [page, setPage] = useState(1);
  const [revealedPasswords, setRevealedPasswords] = useState(() => new Set());
  const [batchSelected, setBatch] = useState([]);
  const [batchStatus, setBatchSt] = useState("Follow Up");
  const [batchSaving, setBatchSaving] = useState(false);

  const [followupModal, setFollowupModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  // ── init: load mteam + coupon + mlm companies ────────────────────────────
  useEffect(() => {
    if (!mteamId) return;
    (async () => {
      try {
        const { getDoc, doc: firestoreDoc } = await import("firebase/firestore");
        const snap = await getDoc(firestoreDoc(db, COLL.MTEAM, mteamId));
        if (!snap.exists()) throw new Error("Team record not found.");
        const mt = { id: snap.id, ...snap.data() };
        setMteamDoc(mt);

        let coupon = null;
        if (mt.assign_coupon_id) {
          const cs = await getDoc(firestoreDoc(db, COLL.COUPONCODE, mt.assign_coupon_id));
          if (cs.exists()) coupon = { id: cs.id, ...cs.data() };
        }
        if (!coupon) {
          const cSnap = await getDocs(
            query(collection(db, COLL.COUPONCODE), where("assigned_user.id", "==", mt.id))
          );
          if (!cSnap.empty) coupon = { id: cSnap.docs[0].id, ...cSnap.docs[0].data() };
        }
        if (coupon) setCouponCode(coupon.code);

        // Fetch active & launched MLM companies from mlmcomp collection
        try {
          const compSnap = await getDocs(
            query(
              collection(db, "mlmcomp"),
              where("Active", "==", true),
              where("launched", "==", true)
            )
          );
          const compList = compSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .map(c => c.name ?? c.companyName ?? c.title ?? "")
            .filter(Boolean)
            .sort();
          setMlmCompanies(compList);
        } catch (_) { }
      } catch (e) {
        setError(e.message);
      } finally {
        setInitLoading(false);
      }
    })();
  }, [mteamId]);

  // ── fetch leads ──────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (!mteamId || !couponCode) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
      const to = new Date(toDate); to.setHours(23, 59, 59, 999);

      // 1. users referred by this mteam member in date range
      const userSnap = await getDocs(
        query(
          collection(db, COLL.USERS),
          where("referredByMteam", "==", mteamId),
          orderBy("createdAt", "desc"),
          limit(300)
        )
      );
      const usersMap = {};
      userSnap.docs.forEach(d => {
        const u = { id: d.id, ...d.data() };
        const ct = u.createdAt?.toDate ? u.createdAt.toDate() : (u.createdAt ? new Date(u.createdAt) : null);
        if (!ct || (ct >= from && ct <= to)) {
          usersMap[u.mobileNo] = u;
        }
      });

      // 2. subscriptions for this coupon (successful) — keep latest per user
      const subSnap = await getDocs(
        query(
          collection(db, COLL.SUBSCRIPTION),
          where("couponApplied", "==", couponCode),
          where("payment", "==", "Success")
        )
      );
      const subsByMobile = {};
      subSnap.docs.forEach(d => {
        const s = { id: d.id, ...d.data() };
        const prev = subsByMobile[s.mobileNo];
        if (!prev) {
          subsByMobile[s.mobileNo] = s;
        } else {
          const prevDate = prev.PurchaseAt?.toDate ? prev.PurchaseAt.toDate() : new Date(prev.PurchaseAt ?? 0);
          const thisDate = s.PurchaseAt?.toDate ? s.PurchaseAt.toDate() : new Date(s.PurchaseAt ?? 0);
          if (thisDate > prevDate) subsByMobile[s.mobileNo] = s;
        }
      });

      // Include subscription users not in usersMap
      const unknownMobiles = Object.keys(subsByMobile).filter(m => !usersMap[m]);
      if (unknownMobiles.length) {
        for (const chunk of chunkArray(unknownMobiles, 30)) {
          const uSnap = await getDocs(
            query(collection(db, COLL.USERS), where("referredByMteam", "==", mteamId), where("mobileNo", "in", chunk))
          );
          uSnap.docs.forEach(d => {
            const u = { id: d.id, ...d.data() };
            usersMap[u.mobileNo] = u;
          });
        }
      }

      const allUsers = Object.values(usersMap);

      // 3. mlm profiles for these users
      const mobiles = allUsers.map(u => u.mobileNo).filter(Boolean);
      const profilesByMobile = {};
      const profileResult = await httpsCallable(functions, "marketingGetProfiles")({ mobiles });
      (profileResult.data.profiles || []).forEach(p => { profilesByMobile[p.mobile] = p; });

      // 4. followups for this mteam
      const fuSnap = await getDocs(
        query(collection(db, COLL.LEADS), where("mteamId", "==", mteamId))
      );
      const fuByUserId = {};
      fuSnap.docs.forEach(d => {
        const f = { id: d.id, ...d.data() };
        fuByUserId[f.userId] = f;
      });
      setFollowups(fuByUserId);

      // 5. merge — only keep valid leads (no active plan / expired / early expiry)
      const enriched = allUsers
        .map(user => ({
          user,
          subscription: subsByMobile[user.mobileNo] ?? null,
          mlmProfile: profilesByMobile[user.mobileNo] ?? null,
          followup: fuByUserId[user.id] ?? null,
        }))
        .filter(({ subscription }) => isValidLead(subscription));

      setLeads(enriched);
      setFetched(true);
      setPage(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mteamId, couponCode, fromDate, toDate]);

  // ── filtered + paginated leads ───────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return leads.filter(({ user, subscription, mlmProfile }) => {
      const followup = followups[user.id];
      const q = filters.search.toLowerCase();
      if (q) {
        const nameMatch = (user.name ?? "").toLowerCase().includes(q);
        const mobileMatch = (user.mobileNo ?? "").toLowerCase().includes(q);
        const compMatch = (mlmProfile?.companyName ?? "").toLowerCase().includes(q);
        if (!nameMatch && !mobileMatch && !compMatch) return false;
      }
      if (filters.leadStatus !== "all") {
        const ls = followup?.leadStatus ?? "New";
        if (ls !== filters.leadStatus) return false;
      }
      if (filters.planStatus !== "all") {
        if (filters.planStatus === "noPlan" && subscription) return false;
        if (filters.planStatus === "expired" && (!subscription || !subscription.Expire)) return false;
      }
      if (filters.mlmProfile !== "all") {
        if (filters.mlmProfile === "hasMlm" && !mlmProfile) return false;
        if (filters.mlmProfile === "noMlm" && mlmProfile) return false;
      }
      if (filters.expiringIn !== "all") {
        const days = subscription ? daysLeft(subscription.expirydate) : null;
        if (days === null) return false;
        const n = filters.expiringIn;
        if (n === "today" && days !== 0) return false;
        if (n === "1" && days !== 1) return false;
        if (n === "2" && days !== 2) return false;
        if (n === "3" && days !== 3) return false;
        if (n === "7" && (days < 0 || days > 7)) return false;
        if (n === "15" && (days < 0 || days > 15)) return false;
      }
      if (filters.company !== "all") {
        const comp = mlmProfile?.companyName ?? subscription?.company ?? "";
        if (comp !== filters.company) return false;
      }
      return true;
    });
  }, [leads, followups, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleLeads = filteredLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Companies list: prefer Firestore mlmcomp, fall back to companies from leads data
  const companiesList = useMemo(() => {
    if (mlmCompanies.length > 0) return mlmCompanies;
    const set = new Set();
    leads.forEach(({ mlmProfile, subscription }) => {
      const c = mlmProfile?.companyName ?? subscription?.company;
      if (c) set.add(c);
    });
    return [...set].sort();
  }, [mlmCompanies, leads]);

  // ── handle save followup ─────────────────────────────────────────────────
  const handleFollowupSave = async ({ leadStatus, note, nextFollowupDate }) => {
    if (!followupModal) return;
    const { user } = followupModal;
    const docId = `${mteamId}_${user.id}`;
    const existing = followups[user.id];

    const historyEntry = {
      note: sanitize(note),
      leadStatus,
      nextFollowupDate: nextFollowupDate || null,
      addedBy: sanitize(session?.name ?? ""),
      addedAt: new Date().toISOString(),
    };

    const newData = {
      mteamId,
      userId: user.id,
      userMobile: user.mobileNo,
      userName: sanitize(user.name ?? ""),
      leadStatus,
      lastFollowupNote: sanitize(note),
      lastFollowupDate: serverTimestamp(),
      nextFollowupDate: nextFollowupDate || null,
      updatedAt: serverTimestamp(),
      history: existing ? [...(existing.history || []), historyEntry] : [historyEntry],
      ...(!existing ? { createdAt: serverTimestamp() } : {}),
    };

    await setDoc(doc(db, COLL.LEADS, docId), newData, { merge: true });

    setFollowups(prev => ({ ...prev, [user.id]: { ...newData, id: docId } }));
    setLeads(prev => prev.map(l => l.user.id === user.id ? { ...l, followup: { ...newData, id: docId } } : l));
  };

  // ── batch status update ──────────────────────────────────────────────────
  const handleBatchUpdate = async () => {
    if (!batchSelected.length) return;
    setBatchSaving(true);
    try {
      const promises = batchSelected.map(async (userId) => {
        const lead = leads.find(l => l.user.id === userId);
        if (!lead) return;
        const docId = `${mteamId}_${userId}`;
        const existing = followups[userId];
        const entry = { leadStatus: batchStatus, note: `Batch updated to ${batchStatus}`, addedBy: sanitize(session?.name ?? ""), addedAt: new Date().toISOString(), nextFollowupDate: null };
        const data = {
          mteamId, userId, userMobile: lead.user.mobileNo,
          userName: sanitize(lead.user.name ?? ""), leadStatus: batchStatus,
          lastFollowupNote: `Batch updated to ${batchStatus}`,
          lastFollowupDate: serverTimestamp(), updatedAt: serverTimestamp(),
          history: existing ? [...(existing.history || []), entry] : [entry],
          ...(!existing ? { createdAt: serverTimestamp() } : {}),
        };
        await setDoc(doc(db, COLL.LEADS, docId), data, { merge: true });
        setFollowups(prev => ({ ...prev, [userId]: { ...data, id: docId } }));
      });
      await Promise.all(promises);
      setLeads(prev => prev.map(l => batchSelected.includes(l.user.id)
        ? { ...l, followup: { ...followups[l.user.id], leadStatus: batchStatus } }
        : l
      ));
      setBatch([]);
    } finally {
      setBatchSaving(false);
    }
  };

  // ── export CSV ───────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = filteredLeads.map(({ user, subscription, mlmProfile }) => {
      const fu = followups[user.id];
      const days = subscription ? daysLeft(subscription.expirydate) : null;
      return {
        "Name": user.name ?? "",
        "Mobile": user.mobileNo ?? "",
        "Referred By": user.referredBy ?? "",
        "Verified": user.isverified ? "Yes" : "No",
        "MLM Profile": mlmProfile ? "Yes" : "No",
        "Company": mlmProfile?.companyName ?? "",
        "Plan Status": subscription ? (subscription.Active && !subscription.Expire ? "Active" : "Expired") : "No Plan",
        "Is Renewal Lead": subscription?.Expire ? "Yes" : "No",
        "Plan": subscription?.plan ?? "",
        "Expiry": subscription?.expirydate ?? "",
        "Days Left": days !== null ? (days <= 0 ? "Expired" : `${days}`) : "",
        "Lead Status": fu?.leadStatus ?? "New",
        "Last Followup": fu?.lastFollowupNote ?? "",
        "Next Followup": fu?.nextFollowupDate ?? "",
        "Joined": user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString("en-IN") : "",
      };
    });
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilters({ search: "", leadStatus: "all", planStatus: "all", mlmProfile: "all", expiringIn: "all", company: "all" });
    setPage(1);
  };

  const setFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1); };
  const toggleBatch = (id) => setBatch(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const togglePassword = (user) => {
    const key = user.id || user.mobileNo;
    setRevealedPasswords(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAllBatch = () => {
    const ids = visibleLeads.map(l => l.user.id);
    const allSel = ids.every(id => batchSelected.includes(id));
    setBatch(prev => allSel ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  const hasActiveFilters = filters.leadStatus !== "all" || filters.planStatus !== "all" || filters.mlmProfile !== "all" || filters.expiringIn !== "all" || filters.company !== "all" || filters.search;

  // ── today's follow-ups ───────────────────────────────────────────────────
  const todayFollowups = useMemo(() => {
    const today = todayStr();
    return leads.filter(({ user }) => {
      const fu = followups[user.id];
      return fu?.nextFollowupDate === today;
    });
  }, [leads, followups]);

  // ── render guards ────────────────────────────────────────────────────────
  if (initLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--p-text-3)", fontSize: 14 }}>
      Loading lead management…
    </div>
  );
  if (error && !fetched) return (
    <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
    </div>
  );

  return (
    <div className="lead-wrap" style={{ maxWidth: 1400, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "2px 12px", borderRadius: 20, background: "#6366f115", border: "1px solid #6366f130", color: "#a5b4fc", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>
          CRM / LEAD MANAGEMENT
        </span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--p-text)" }}>Lead Pipeline</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--p-text-3)" }}>
          New users, expired & expiring soon — track, follow up, and convert.
        </p>
      </div>

      {/* ── DATE RANGE + FETCH ────────────────────────────────────────────── */}
      <div className="lead-date-row" style={{ padding: "16px", background: "var(--p-card)", borderRadius: 14, border: "1px solid var(--p-border)", marginBottom: 18 }}>
        <div className="lead-date-input">
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>From Date</label>
          <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", background: "var(--p-card2)", border: "1.5px solid var(--p-border)", borderRadius: 9, color: "var(--p-text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div className="lead-date-input">
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>To Date</label>
          <input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={e => setToDate(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", background: "var(--p-card2)", border: "1.5px solid var(--p-border)", borderRadius: 9, color: "var(--p-text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <button
          onClick={fetchLeads}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 10, border: "none",
            background: loading ? "#4338ca60" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", flexShrink: 0
          }}
        >
          {loading ? (
            <><span style={{ width: 14, height: 14, border: "2px solid #ffffff40", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> Loading…</>
          ) : (
            <><IcRefresh /> {fetched ? "Refresh" : "Fetch Leads"}</>
          )}
        </button>

        {fetched && (
          <>
            <button onClick={handleExportCSV} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1.5px solid #10b98140", background: "#10b98115", color: "#10b981", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
              <IcDownload /> CSV
            </button>
            <span style={{ fontSize: 13, color: "var(--p-text-3)", alignSelf: "center", flexShrink: 0 }}>
              {filteredLeads.length}/{leads.length}
            </span>
          </>
        )}
      </div>

      {/* ── TODAY'S FOLLOW-UPS ───────────────────────────────────────────── */}
      {fetched && todayFollowups.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--p-text)" }}>Today's Follow-ups</span>
            <span style={{ padding: "2px 10px", borderRadius: 20, background: "#ef444415", color: "#ef4444", fontSize: 11, fontWeight: 800, border: "1px solid #ef444430" }}>
              {todayFollowups.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {todayFollowups.map(({ user, subscription, mlmProfile }) => {
              const fu = followups[user.id];
              const days = subscription ? daysLeft(subscription.expirydate) : null;
              const isRenewal = subscription?.Expire === true;
              return (
                <div key={user.id} style={{
                  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                  padding: "13px 16px", borderRadius: 14,
                  background: "linear-gradient(135deg,#f59e0b08,#ef444408)",
                  border: "1.5px solid #f59e0b40",
                  boxShadow: "0 2px 12px #f59e0b10",
                }}>
                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                    {(user.name || "?")[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "var(--p-text)" }}>{user.name}</span>
                      {isRenewal && <RenewalBadge />}
                      <LeadStatusBadge status={fu?.leadStatus ?? "New"} />
                      {mlmProfile && (
                        <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#10b98115", color: "#10b981" }}>MLM ✓</span>
                      )}
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--p-text-3)" }}>{user.mobileNo}</p>
                    {fu?.lastFollowupNote && (
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--p-text-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                        📝 {fu.lastFollowupNote}
                      </p>
                    )}
                  </div>

                  {/* Plan info */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <PlanStatusBadge subscription={subscription} />
                    {days !== null && <DaysLeftBadge days={days} />}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                    <a href={`tel:${user.mobileNo}`} title="Call"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                      <IcPhone /> Call
                    </a>
                    <a href={`https://wa.me/91${user.mobileNo}`} target="_blank" rel="noreferrer" title="WhatsApp"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, background: "#25D36615", color: "#25D366", border: "1px solid #25D36630", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                      <IcWhatsapp /> WA
                    </a>
                    <button onClick={() => setFollowupModal({ user, subscription, mlmProfile, followup: fu })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, background: "#6366f115", color: "#a5b4fc", border: "1px solid #6366f130", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      <IcEdit /> Note
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fetched && (
        <>
          {/* ── FILTERS ──────────────────────────────────────────────────── */}
          <div className="lead-filters-scroll" style={{ marginBottom: 14 }}>

            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, flex: "1 1 180px", minWidth: 160 }}>
              <IcSearch />
              <input
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                placeholder="Search name, mobile, company…"
                style={{ border: "none", background: "transparent", outline: "none", color: "var(--p-text)", fontSize: 13, flex: 1 }}
              />
              {filters.search && <button onClick={() => setFilter("search", "")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text-4)", display: "flex", padding: 0 }}><IcX /></button>}
            </div>

            {/* Lead Status — only 4 options */}
            <select value={filters.leadStatus} onChange={e => setFilter("leadStatus", e.target.value)}
              style={{ padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
              <option value="all">All Status</option>
              <option value="New">New</option>
              <option value="Lost">Lost</option>
              <option value="Renewal Follow Up">Renewal Follow Up</option>
              <option value="Follow Up">Follow Up</option>
            </select>

            {/* MLM Profile filter */}
            <select value={filters.mlmProfile} onChange={e => setFilter("mlmProfile", e.target.value)}
              style={{ padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
              <option value="all">All Profiles</option>
              <option value="hasMlm">Have MLM Profile</option>
              <option value="noMlm">No MLM Profile</option>
            </select>

            {/* Plan Status — only No Plan and Expired */}
            <select value={filters.planStatus} onChange={e => setFilter("planStatus", e.target.value)}
              style={{ padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
              <option value="all">All Plans</option>
              <option value="noPlan">No Plan</option>
              <option value="expired">Expired (Need Renewal)</option>
            </select>

            {/* Expiring In */}
            <select value={filters.expiringIn} onChange={e => setFilter("expiringIn", e.target.value)}
              style={{ padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
              <option value="all">Expiring: All</option>
              <option value="today">Today</option>
              <option value="1">In 1 Day</option>
              <option value="2">In 2 Days</option>
              <option value="3">In 3 Days</option>
              <option value="7">Within 7 Days</option>
              <option value="15">Within 15 Days</option>
            </select>

            {/* Company — from mlmcomp (Active+launched) or leads data fallback */}
            <select value={filters.company} onChange={e => setFilter("company", e.target.value)}
              style={{ padding: "8px 12px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 10, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
              <option value="all">All Companies</option>
              {companiesList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button onClick={clearFilters}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #ef444440", background: "#ef444410", color: "#ef4444", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <IcX /> Clear
              </button>
            )}
          </div>

          {/* ── BATCH ACTIONS ────────────────────────────────────────────── */}
          {batchSelected.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#6366f110", borderRadius: 12, border: "1.5px solid #6366f130", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>{batchSelected.length} selected</span>
              <select value={batchStatus} onChange={e => setBatchSt(e.target.value)}
                style={{ padding: "7px 10px", background: "var(--p-card)", border: "1.5px solid var(--p-border)", borderRadius: 9, color: "var(--p-text)", fontSize: 13, outline: "none" }}>
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={handleBatchUpdate} disabled={batchSaving}
                style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: batchSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {batchSaving ? "Saving…" : <><IcCheck /> Update Status</>}
              </button>
              <button onClick={() => setBatch([])} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-text-3)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Deselect All
              </button>
            </div>
          )}

          {/* ── TABLE ────────────────────────────────────────────────────── */}
          {filteredLeads.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--p-text-3)" }}>
              <div style={{ marginBottom: 12 }}><IcUsers /></div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>No leads found</p>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="leads-table-wrap" style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--p-border)", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                  <thead>
                    <tr style={{ background: "var(--p-card2)" }}>
                      <th style={th()}>
                        <input type="checkbox" onChange={toggleAllBatch}
                          checked={visibleLeads.length > 0 && visibleLeads.every(l => batchSelected.includes(l.user.id))}
                          style={{ cursor: "pointer" }} />
                      </th>
                      <th style={th()}>User</th>
                      <th style={th()}>Joined</th>
                      <th style={th()}>Mobile</th>
                      <th style={th()}>Password</th>
                      <th style={th()}>MLM Profile</th>
                      <th style={th()}>Plan Status</th>
                      <th style={th()}>Plan</th>
                      <th style={th()}>Expiry</th>
                      <th style={th()}>Days Left</th>
                      <th style={th()}>Lead Status</th>
                      <th style={th()}>Follow-up</th>
                      <th style={{ ...th(), textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map(({ user, subscription, mlmProfile }, idx) => {
                      const followup = followups[user.id];
                      const days = subscription ? daysLeft(subscription.expirydate) : null;
                      const isSel = batchSelected.includes(user.id);
                      const isUrgent = days !== null && days >= 0 && days <= 3;
                      const isRenewal = subscription?.Expire === true;
                      const passwordKey = user.id || user.mobileNo;
                      const isPasswordRevealed = revealedPasswords.has(passwordKey);

                      return (
                        <tr key={user.id} style={{ background: isUrgent ? "#ef444408" : idx % 2 === 1 ? "var(--p-bg)" : "transparent", transition: "background 0.15s" }}>
                          <td style={td()}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleBatch(user.id)} style={{ cursor: "pointer" }} />
                          </td>
                          <td style={td()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                {(user.name || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--p-text)" }}>{user.name}</span>
                                {isRenewal && (
                                  <div style={{ marginTop: 2 }}>
                                    <RenewalBadge />
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={td()}>
                            <span style={{ fontSize: 12, color: "var(--p-text-3)", whiteSpace: "nowrap" }}>
                              {user.createdAt?.toDate
                                ? user.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                : user.createdAt
                                  ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                  : "—"}
                            </span>
                          </td>
                          <td style={td()}>
                            <span style={{ fontSize: 13, color: "var(--p-text-3)" }}>{user.mobileNo}</span>
                          </td>
                          <td style={td()}>
                            <PasswordValue
                              value={user.password}
                              revealed={isPasswordRevealed}
                              onToggle={() => togglePassword(user)}
                            />
                          </td>
                          <td style={td()}>
                            <span style={{
                              padding: "2px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: mlmProfile ? "#10b98115" : "#94a3b815",
                              color: mlmProfile ? "#10b981" : "#94a3b8",
                            }}>
                              {mlmProfile ? "Yes" : "No"}
                            </span>
                          </td>
                          <td style={td()}><PlanStatusBadge subscription={subscription} /></td>
                          <td style={td()}>
                            <span style={{ fontSize: 12, color: "var(--p-text-3)" }}>{subscription?.plan ?? "—"}</span>
                          </td>
                          <td style={td()}>
                            <span style={{ fontSize: 12, color: "var(--p-text-3)", whiteSpace: "nowrap" }}>{subscription?.expirydate ?? "—"}</span>
                          </td>
                          <td style={td()}><DaysLeftBadge days={days} /></td>
                          <td style={td()}>
                            <LeadStatusBadge status={followup?.leadStatus ?? "New"} />
                          </td>
                          <td style={{ ...td(), maxWidth: 160 }}>
                            {followup?.lastFollowupNote ? (
                              <p style={{ margin: 0, fontSize: 11, color: "var(--p-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }} title={followup.lastFollowupNote}>
                                {followup.lastFollowupNote}
                              </p>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--p-text-4)" }}>No followup yet</span>
                            )}
                          </td>
                          <td style={{ ...td(), textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                              <a href={`tel:${user.mobileNo}`} title="Call"
                                style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130", textDecoration: "none" }}>
                                <IcPhone />
                              </a>
                              <a href={`https://wa.me/91${user.mobileNo}`} target="_blank" rel="noreferrer" title="WhatsApp"
                                style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#25D36615", color: "#25D366", border: "1px solid #25D36630", textDecoration: "none" }}>
                                <IcWhatsapp />
                              </a>
                              <button onClick={() => setFollowupModal({ user, subscription, mlmProfile, followup })} title="Follow-up"
                                style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#6366f115", color: "#a5b4fc", border: "1px solid #6366f130", cursor: "pointer" }}>
                                <IcEdit />
                              </button>
                              <button onClick={() => setViewModal({ user, subscription, mlmProfile, followup })} title="View"
                                style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b30", cursor: "pointer" }}>
                                <IcEye />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="leads-card-list" style={{ marginBottom: 16 }}>
                {visibleLeads.map(({ user, subscription, mlmProfile }) => {
                  const followup = followups[user.id];
                  const days = subscription ? daysLeft(subscription.expirydate) : null;
                  const isSel = batchSelected.includes(user.id);
                  const isUrgent = days !== null && days >= 0 && days <= 3;
                  const isRenewal = subscription?.Expire === true;
                  const passwordKey = user.id || user.mobileNo;
                  const isPasswordRevealed = revealedPasswords.has(passwordKey);
                  return (
                    <div key={user.id} style={{
                      background: "var(--p-card)",
                      border: isUrgent ? "1.5px solid #ef444430" : "1px solid var(--p-border)",
                      borderRadius: 14, padding: "14px", position: "relative",
                      boxShadow: isSel ? "0 0 0 2px #6366f1" : "none",
                    }}>
                      {/* Select checkbox */}
                      <input type="checkbox" checked={isSel} onChange={() => toggleBatch(user.id)}
                        style={{ position: "absolute", top: 14, right: 14, cursor: "pointer", width: 16, height: 16 }} />

                      {/* Name + mobile */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingRight: 24 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                          {(user.name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--p-text)" }}>{user.name}</p>
                            {isRenewal && <RenewalBadge />}
                          </div>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--p-text-3)" }}>{user.mobileNo}</p>
                        </div>
                      </div>

                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 10, marginBottom: 10, padding: "8px 10px",
                        background: "var(--p-card2)", border: "1px solid var(--p-border)", borderRadius: 9,
                      }}>
                        <span style={{ color: "var(--p-text-4)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Password
                        </span>
                        <PasswordValue
                          value={user.password}
                          revealed={isPasswordRevealed}
                          onToggle={() => togglePassword(user)}
                        />
                      </div>

                      {/* Badges row */}
                      {/* Badges row */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        <LeadStatusBadge status={followup?.leadStatus ?? "New"} />
                        <PlanStatusBadge subscription={subscription} />
                        {subscription?.plan && (
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#6366f115", color: "#a5b4fc" }}>{subscription.plan}</span>
                        )}
                        {days !== null && <DaysLeftBadge days={days} />}
                        {mlmProfile && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#10b98115", color: "#10b981" }}>MLM ✓</span>}

                        {/* Joined date */}
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "var(--p-card2)", color: "var(--p-text-3)", border: "1px solid var(--p-border)" }}>
                          📅 {user.createdAt?.toDate
                            ? user.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : user.createdAt
                              ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                        </span>
                      </div>

                      {/* Follow-up note */}
                      {followup?.lastFollowupNote && (
                        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--p-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          📝 {followup.lastFollowupNote}
                        </p>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a href={`tel:${user.mobileNo}`}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 0", borderRadius: 10, background: "#10b98115", color: "#10b981", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1px solid #10b98130" }}>
                          <IcPhone /> Call
                        </a>
                        <a href={`https://wa.me/91${user.mobileNo}`} target="_blank" rel="noreferrer"
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 0", borderRadius: 10, background: "#25D36615", color: "#25D366", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1px solid #25D36630" }}>
                          <IcWhatsapp /> WA
                        </a>
                        <button onClick={() => setFollowupModal({ user, subscription, mlmProfile, followup })}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 0", borderRadius: 10, background: "#6366f115", color: "#a5b4fc", fontSize: 13, fontWeight: 700, border: "1px solid #6366f130", cursor: "pointer" }}>
                          <IcEdit /> Note
                        </button>
                        <button onClick={() => setViewModal({ user, subscription, mlmProfile, followup })}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 0", borderRadius: 10, background: "#f59e0b15", color: "#f59e0b", fontSize: 13, fontWeight: 700, border: "1px solid #f59e0b30", cursor: "pointer" }}>
                          <IcEye /> View
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── PAGINATION ───────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--p-text-3)" }}>
                Page {safePage} of {totalPages} · {filteredLeads.length} leads
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(1)} disabled={safePage === 1} style={paginBtn(safePage === 1)}>«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={paginBtn(safePage === 1)}><IcChevL /></button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                  const p = start + i;
                  return (
                    <button key={p} onClick={() => setPage(p)} style={{ ...paginBtn(false), ...(p === safePage ? { background: "#6366f1", color: "#fff", borderColor: "#6366f1" } : {}) }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={paginBtn(safePage === totalPages)}><IcChevR /></button>
                <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} style={paginBtn(safePage === totalPages)}>»</button>
              </div>
            </div>
          )}
        </>
      )}

      {!fetched && !loading && (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--p-text-3)" }}>
          <div style={{ marginBottom: 12 }}><IcUsers /></div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Select a date range and click Fetch Leads</p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>Data is fetched on-demand to keep things fast.</p>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {followupModal && (
        <FollowupModal
          lead={followupModal}
          onClose={() => setFollowupModal(null)}
          onSave={handleFollowupSave}
          session={session}
        />
      )}
      {viewModal && (
        <ViewModal
          lead={viewModal}
          onClose={() => setViewModal(null)}
          onFollowup={() => setFollowupModal(viewModal)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── style helpers ──────────────────────────────────────────────────────────
function th() {
  return {
    padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--p-text-4)",
    textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "left",
    borderBottom: "2px solid var(--p-border)", whiteSpace: "nowrap",
  };
}
function td() {
  return {
    padding: "10px 14px", fontSize: 13, color: "var(--p-text)",
    borderBottom: "1px solid var(--p-border)",
  };
}
function paginBtn(disabled) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 34, height: 34, borderRadius: 8,
    border: "1.5px solid var(--p-border)", background: "var(--p-card)",
    color: disabled ? "var(--p-text-4)" : "var(--p-text-2)",
    fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
