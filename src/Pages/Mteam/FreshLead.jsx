import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../Firebase";
import { COLL } from "../../Utils/collections";
import { getSession } from "../../Utils/sessionManager";
import Paginator from "./Paginator";

// ── helpers ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;
const MOBILE_REGEX = /^\d{10}$/;
const FETCH_LIMIT = 2000; // bounded fetch; data is filtered/paginated client-side

function sanitize(v) {
  if (typeof v !== "string") return v ?? "";
  return v
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 500);
}
function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function toJsDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDate(v) {
  const d = toJsDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── SVG Icons ──────────────────────────────────────────────────────────────
const IcPhone = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.14-1.93a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.6z" />
  </svg>
);
const IcWhatsapp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.556 4.121 1.523 5.849L.057 23.97l6.29-1.647A11.956 11.956 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm.029 21.818a9.841 9.841 0 0 1-5.012-1.366l-.36-.214-3.732.978.994-3.634-.235-.374A9.831 9.831 0 0 1 2.18 12c0-5.432 4.418-9.849 9.849-9.849 5.432 0 9.849 4.417 9.849 9.849 0 5.432-4.417 9.818-9.849 9.818z" />
  </svg>
);
const IcEdit = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IcTrash = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const IcPlus = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IcX = () => (
  <svg
    width="14"
    height="14"
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
const IcCheck = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcSearch = () => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IcRefresh = () => (
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
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-4.9" />
  </svg>
);
const IcUsers = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IcDownload = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ── shared field styles ──────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--p-card2)",
  border: "1.5px solid var(--p-border)",
  borderRadius: 10,
  color: "var(--p-text)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--p-text-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// ── Add / Edit Modal ─────────────────────────────────────────────────────────
function LeadFormModal({ initial, onClose, onSave, checkDuplicate }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    mobileNo: initial?.mobileNo ?? "",
    companyName: initial?.companyName ?? "",
    rank: initial?.rank ?? "",
    remarks: initial?.remarks ?? "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => {
      const c = { ...e };
      delete c[key];
      return c;
    });
  };

  const handleSubmit = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!MOBILE_REGEX.test(form.mobileNo.trim()))
      e.mobileNo = "Enter a valid 10-digit mobile number";
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }

    setSaving(true);
    try {
      const isDup = await checkDuplicate(form.mobileNo.trim(), initial?.id);
      if (isDup) {
        setErrors({
          mobileNo: "A lead with this mobile number already exists",
        });
        setSaving(false);
        return;
      }
      await onSave({
        name: sanitize(form.name),
        mobileNo: form.mobileNo.trim(),
        companyName: sanitize(form.companyName),
        rank: sanitize(form.rank),
        remarks: sanitize(form.remarks),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "var(--p-card)",
          borderRadius: 20,
          boxShadow: "0 24px 80px #0009",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--p-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: 15,
              color: "var(--p-text)",
            }}
          >
            {isEdit ? "Edit Fresh Lead" : "Add Fresh Lead"}
          </p>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--p-text-3)",
              display: "flex",
              padding: 4,
            }}
          >
            <IcX />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Lead's full name"
              style={inputStyle}
            />
            {errors.name && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#ef4444" }}>
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Mobile No *</label>
            <input
              value={form.mobileNo}
              onChange={(e) =>
                setField(
                  "mobileNo",
                  e.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              placeholder="10-digit mobile number"
              inputMode="numeric"
              style={inputStyle}
            />
            {errors.mobileNo && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#ef4444" }}>
                {errors.mobileNo}
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Company Name *</label>
            <input
              value={form.companyName}
              onChange={(e) => setField("companyName", e.target.value)}
              placeholder="MLM company name"
              style={inputStyle}
            />
            {errors.companyName && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#ef4444" }}>
                {errors.companyName}
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Rank</label>
            <input
              value={form.rank}
              onChange={(e) => setField("rank", e.target.value)}
              placeholder="e.g. Diamond, Gold, Distributor"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) =>
                setField("remarks", e.target.value.slice(0, 500))
              }
              placeholder="Any notes about this lead…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--p-text-4)",
                textAlign: "right",
              }}
            >
              {form.remarks.length}/500
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: saving
                ? "#4338ca60"
                : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                <IcCheck /> {isEdit ? "Update Lead" : "Save Lead"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ lead, onClose, onConfirm, deleting }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "var(--p-card)",
          borderRadius: 18,
          boxShadow: "0 24px 80px #0009",
          width: "100%",
          maxWidth: 380,
          padding: 22,
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontWeight: 800,
            fontSize: 15,
            color: "var(--p-text)",
          }}
        >
          Delete this lead?
        </p>
        <p
          style={{ margin: "0 0 20px", fontSize: 13, color: "var(--p-text-3)" }}
        >
          <strong style={{ color: "var(--p-text)" }}>{lead.name}</strong> (
          {lead.mobileNo}) will be permanently removed. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: "1px solid var(--p-border)",
              background: "transparent",
              color: "var(--p-text-2)",
              fontWeight: 600,
              fontSize: 13,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: deleting ? "#ef444460" : "#ef4444",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === "error";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 22,
        right: 22,
        zIndex: 1300,
        padding: "12px 18px",
        borderRadius: 12,
        background: isErr ? "#ef4444" : "#10b981",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 32px #0005",
        maxWidth: 320,
      }}
    >
      {toast.msg}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export default function FreshLead({ mteamSession }) {
  const session = mteamSession ?? getSession();
  const mteamId = session?.mteamId;

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [downloadFilter, setDownloadFilter] = useState("all"); // all | downloaded | notdownloaded
  const [page, setPage] = useState(1);

  const [formModal, setFormModal] = useState(null); // null | true (new) | leadObj (edit)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  // ── fetch leads scoped to this team ────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (!mteamId) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(
          collection(db, COLL.FRESHLEADS),
          where("mteamId", "==", mteamId),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      );
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mteamId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── uniqueness check across ALL teams' fresh leads ─────────────────────────
  const checkDuplicate = useCallback(async (mobileNo, excludeId) => {
    const snap = await getDocs(
      query(collection(db, COLL.FRESHLEADS), where("mteamId", "==", mteamId), where("mobileNo", "==", mobileNo)),
    );
    return snap.docs.some((d) => d.id !== excludeId);
  }, [mteamId]);

  // ── save (create or update) ─────────────────────────────────────────────────
  const handleSave = async (data) => {
    try {
      if (formModal && formModal !== true && formModal.id) {
        await updateDoc(doc(db, COLL.FRESHLEADS, formModal.id), {
          ...data,
          updatedAt: serverTimestamp(),
          updatedBy: sanitize(session?.name ?? ""),
        });
        setLeads((prev) =>
          prev.map((l) => (l.id === formModal.id ? { ...l, ...data } : l)),
        );
        setToast({ type: "success", msg: "Lead updated successfully" });
      } else {
        const payload = {
          ...data,
          mteamId,
          downloaded: false, // default flag — Not Downloaded until toggled from the list
          createdBy: sanitize(session?.name ?? ""),
          createdByMobile: session?.mobile ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, COLL.FRESHLEADS), payload);
        setLeads((prev) => [
          { id: ref.id, ...payload, createdAt: new Date() },
          ...prev,
        ]);
        setToast({ type: "success", msg: "Lead added successfully" });
      }
      setFormModal(null);
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Something went wrong" });
    }
  };

  // ── toggle downloaded / not downloaded flag ─────────────────────────────────
  const toggleDownloaded = async (lead) => {
    const next = !lead.downloaded;
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, downloaded: next } : l)),
    );
    try {
      await updateDoc(doc(db, COLL.FRESHLEADS, lead.id), {
        downloaded: next,
        updatedAt: serverTimestamp(),
        updatedBy: sanitize(session?.name ?? ""),
      });
      setToast({
        type: "success",
        msg: next ? "Marked as Downloaded" : "Marked as Not Downloaded",
      });
    } catch (e) {
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, downloaded: !next } : l)),
      );
      setToast({ type: "error", msg: e.message || "Failed to update status" });
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, COLL.FRESHLEADS, deleteTarget.id));
      setLeads((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setToast({ type: "success", msg: "Lead deleted" });
      setDeleteTarget(null);
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Failed to delete" });
    } finally {
      setDeleting(false);
    }
  };

  // ── derived company list from current data ──────────────────────────────────
  const companiesList = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => {
      if (l.companyName) set.add(l.companyName);
    });
    return [...set].sort();
  }, [leads]);

  // ── filter (date + company + search only, ignores status) — basis for stat cards ──
  const scopedLeads = useMemo(() => {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const ct = toJsDate(l.createdAt);
      if (ct && (ct < from || ct > to)) return false;
      if (companyFilter !== "all" && l.companyName !== companyFilter)
        return false;
      if (q) {
        const nameMatch = (l.name ?? "").toLowerCase().includes(q);
        const mobileMatch = (l.mobileNo ?? "").includes(q);
        if (!nameMatch && !mobileMatch) return false;
      }
      return true;
    });
  }, [leads, fromDate, toDate, companyFilter, search]);

  // ── downloaded / not downloaded counts + percentages for the stat cards ─────
  const downloadStats = useMemo(() => {
    const total = scopedLeads.length;
    const downloaded = scopedLeads.filter((l) => l.downloaded).length;
    const notDownloaded = total - downloaded;
    const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
    return {
      total,
      downloaded,
      notDownloaded,
      downloadedPct: pct(downloaded),
      notDownloadedPct: pct(notDownloaded),
    };
  }, [scopedLeads]);

  // ── filter + sort (adds status filter on top of scopedLeads) ────────────────
  const filteredLeads = useMemo(() => {
    return scopedLeads
      .filter((l) => {
        if (downloadFilter === "downloaded" && !l.downloaded) return false;
        if (downloadFilter === "notdownloaded" && l.downloaded) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = toJsDate(a.createdAt)?.getTime() ?? 0;
        const tb = toJsDate(b.createdAt)?.getTime() ?? 0;
        return tb - ta;
      });
  }, [scopedLeads, downloadFilter]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, companyFilter, downloadFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleLeads = filteredLeads.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const hasActiveFilters =
    companyFilter !== "all" || downloadFilter !== "all" || !!search;
  const clearFilters = () => {
    setCompanyFilter("all");
    setDownloadFilter("all");
    setSearch("");
  };

  if (loading && leads.length === 0)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 300,
          color: "var(--p-text-3)",
          fontSize: 14,
        }}
      >
        Loading fresh leads…
      </div>
    );
  if (error && leads.length === 0)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
      </div>
    );

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <span
            style={{
              display: "inline-block",
              padding: "2px 12px",
              borderRadius: 20,
              background: "#6366f115",
              border: "1px solid #6366f130",
              color: "#a5b4fc",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            CRM / MANUAL LEADS
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: "var(--p-text)",
            }}
          >
            Fresh Lead
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--p-text-3)",
            }}
          >
            Manually added leads — add, edit, call & follow up.
          </p>
        </div>
        <button
          onClick={() => setFormModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "11px 20px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IcPlus /> Add Fresh Lead
        </button>
      </div>

      {/* ── DOWNLOAD STATUS SUMMARY CARDS ───────────────────────────────── */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}
      >
        <button
          onClick={() =>
            setDownloadFilter(
              downloadFilter === "downloaded" ? "all" : "downloaded",
            )
          }
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            textAlign: "left",
            cursor: "pointer",
            padding: "16px 18px",
            borderRadius: 14,
            background: "var(--p-card)",
            border:
              downloadFilter === "downloaded"
                ? "1.5px solid #10b981"
                : "1px solid var(--p-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--p-text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Downloaded
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 26,
                fontWeight: 800,
                color: "var(--p-text)",
              }}
            >
              {downloadStats.downloaded}{" "}
              <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                ({downloadStats.downloadedPct}%)
              </span>
            </p>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "#10b98115",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IcDownload />
          </div>
        </button>

        <button
          onClick={() =>
            setDownloadFilter(
              downloadFilter === "notdownloaded" ? "all" : "notdownloaded",
            )
          }
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            textAlign: "left",
            cursor: "pointer",
            padding: "16px 18px",
            borderRadius: 14,
            background: "var(--p-card)",
            border:
              downloadFilter === "notdownloaded"
                ? "1.5px solid #f59e0b"
                : "1px solid var(--p-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--p-text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Not Downloaded
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 26,
                fontWeight: 800,
                color: "var(--p-text)",
              }}
            >
              {downloadStats.notDownloaded}{" "}
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>
                ({downloadStats.notDownloadedPct}%)
              </span>
            </p>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "#f59e0b15",
              color: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IcDownload />
          </div>
        </button>
      </div>

      {/* ── DATE RANGE + REFRESH ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 12,
          padding: "16px",
          background: "var(--p-card)",
          borderRadius: 14,
          border: "1px solid var(--p-border)",
          marginBottom: 14,
        }}
      >
        <div style={{ flex: "1 1 150px", minWidth: 140 }}>
          <label style={labelStyle}>From Date</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: "1 1 150px", minWidth: 140 }}>
          <label style={labelStyle}>To Date</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={todayStr()}
            onChange={(e) => setToDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={fetchLeads}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 18px",
            borderRadius: 10,
            border: "1.5px solid #6366f140",
            background: "#6366f115",
            color: "#a5b4fc",
            fontWeight: 700,
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          <IcRefresh /> {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span style={{ fontSize: 13, color: "var(--p-text-3)", flexShrink: 0 }}>
          {filteredLeads.length}/{leads.length} leads
        </span>
      </div>

      {/* ── SEARCH + COMPANY FILTER ─────────────────────────────────────── */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 12px",
            background: "var(--p-card)",
            border: "1.5px solid var(--p-border)",
            borderRadius: 10,
            flex: "1 1 220px",
            minWidth: 180,
          }}
        >
          <IcSearch />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or mobile number…"
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              color: "var(--p-text)",
              fontSize: 13,
              flex: 1,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--p-text-4)",
                display: "flex",
                padding: 0,
              }}
            >
              <IcX />
            </button>
          )}
        </div>

        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "var(--p-card)",
            border: "1.5px solid var(--p-border)",
            borderRadius: 10,
            color: "var(--p-text)",
            fontSize: 13,
            outline: "none",
          }}
        >
          <option value="all">All Companies</option>
          {companiesList.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={downloadFilter}
          onChange={(e) => setDownloadFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "var(--p-card)",
            border: "1.5px solid var(--p-border)",
            borderRadius: 10,
            color: "var(--p-text)",
            fontSize: 13,
            outline: "none",
          }}
        >
          <option value="all">All Status</option>
          <option value="downloaded">Downloaded</option>
          <option value="notdownloaded">Not Downloaded</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1.5px solid #ef444440",
              background: "#ef444410",
              color: "#ef4444",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <IcX /> Clear
          </button>
        )}
      </div>

      {/* ── LIST ─────────────────────────────────────────────────────────── */}
      {filteredLeads.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "var(--p-text-3)",
          }}
        >
          <div
            style={{
              marginBottom: 12,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <IcUsers />
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            No fresh leads found
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>
            Add a new lead, or adjust your filters and date range.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div
            className="freshlead-table-wrap"
            style={{
              overflowX: "auto",
              borderRadius: 14,
              border: "1px solid var(--p-border)",
              marginBottom: 16,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 880,
              }}
            >
              <thead>
                <tr style={{ background: "var(--p-card2)" }}>
                  <th style={th()}>Name</th>
                  <th style={th()}>Mobile</th>
                  <th style={th()}>Company</th>
                  <th style={th()}>Rank</th>
                  <th style={th()}>Remarks</th>
                  <th style={th()}>Created</th>
                  <th style={{ ...th(), textAlign: "center" }}>Status</th>
                  <th style={{ ...th(), textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead, idx) => (
                  <tr
                    key={lead.id}
                    style={{
                      background: idx % 2 === 1 ? "var(--p-bg)" : "transparent",
                    }}
                  >
                    <td style={td()}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            background:
                              "linear-gradient(135deg,#6366f1,#8b5cf6)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontWeight: 800,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {(lead.name || "?")[0].toUpperCase()}
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: "var(--p-text)",
                          }}
                        >
                          {lead.name}
                        </span>
                      </div>
                    </td>
                    <td style={td()}>
                      <span style={{ fontSize: 13, color: "var(--p-text-3)" }}>
                        {lead.mobileNo}
                      </span>
                    </td>
                    <td style={td()}>
                      <span style={{ fontSize: 13, color: "var(--p-text-2)" }}>
                        {lead.companyName || "—"}
                      </span>
                    </td>
                    <td style={td()}>
                      {lead.rank ? (
                        <span
                          style={{
                            padding: "2px 9px",
                            borderRadius: 6,
                            background: "#f59e0b15",
                            color: "#f59e0b",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {lead.rank}
                        </span>
                      ) : (
                        <span
                          style={{ color: "var(--p-text-4)", fontSize: 12 }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ ...td(), maxWidth: 180 }}>
                      {lead.remarks ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "var(--p-text-3)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 170,
                          }}
                          title={lead.remarks}
                        >
                          {lead.remarks}
                        </p>
                      ) : (
                        <span
                          style={{ fontSize: 11, color: "var(--p-text-4)" }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--p-text-3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(lead.createdAt)}
                      </span>
                    </td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      <button
                        onClick={() => toggleDownloaded(lead)}
                        title="Click to toggle"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          background: lead.downloaded
                            ? "#10b98115"
                            : "#f59e0b15",
                          color: lead.downloaded ? "#10b981" : "#f59e0b",
                          border: `1px solid ${lead.downloaded ? "#10b98130" : "#f59e0b30"}`,
                        }}
                      >
                        <IcDownload />{" "}
                        {lead.downloaded ? "Downloaded" : "Not Downloaded"}
                      </button>
                    </td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent: "center",
                        }}
                      >
                        <a
                          href={`tel:${lead.mobileNo}`}
                          title="Call"
                          style={{
                            display: "inline-flex",
                            padding: "5px 8px",
                            borderRadius: 8,
                            background: "#10b98115",
                            color: "#10b981",
                            border: "1px solid #10b98130",
                            textDecoration: "none",
                          }}
                        >
                          <IcPhone />
                        </a>
                        <a
                          href={`https://wa.me/91${lead.mobileNo}`}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          style={{
                            display: "inline-flex",
                            padding: "5px 8px",
                            borderRadius: 8,
                            background: "#25D36615",
                            color: "#25D366",
                            border: "1px solid #25D36630",
                            textDecoration: "none",
                          }}
                        >
                          <IcWhatsapp />
                        </a>
                        <button
                          onClick={() => setFormModal(lead)}
                          title="Edit"
                          style={{
                            display: "inline-flex",
                            padding: "5px 8px",
                            borderRadius: 8,
                            background: "#6366f115",
                            color: "#a5b4fc",
                            border: "1px solid #6366f130",
                            cursor: "pointer",
                          }}
                        >
                          <IcEdit />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(lead)}
                          title="Delete"
                          style={{
                            display: "inline-flex",
                            padding: "5px 8px",
                            borderRadius: 8,
                            background: "#ef444415",
                            color: "#ef4444",
                            border: "1px solid #ef444430",
                            cursor: "pointer",
                          }}
                        >
                          <IcTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div
            className="freshlead-card-list"
            style={{
              marginBottom: 16,
              display: "none",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {visibleLeads.map((lead) => (
              <div
                key={lead.id}
                style={{
                  background: "var(--p-card)",
                  border: "1px solid var(--p-border)",
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {(lead.name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 700,
                        fontSize: 14,
                        color: "var(--p-text)",
                      }}
                    >
                      {lead.name}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 12,
                        color: "var(--p-text-3)",
                      }}
                    >
                      {lead.mobileNo}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  {lead.companyName && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "#6366f115",
                        color: "#a5b4fc",
                      }}
                    >
                      {lead.companyName}
                    </span>
                  )}
                  {lead.rank && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "#f59e0b15",
                        color: "#f59e0b",
                      }}
                    >
                      {lead.rank}
                    </span>
                  )}
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--p-card2)",
                      color: "var(--p-text-3)",
                    }}
                  >
                    {formatDate(lead.createdAt)}
                  </span>
                </div>

                <button
                  onClick={() => toggleDownloaded(lead)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    width: "100%",
                    padding: "7px 0",
                    borderRadius: 10,
                    marginBottom: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: lead.downloaded ? "#10b98115" : "#f59e0b15",
                    color: lead.downloaded ? "#10b981" : "#f59e0b",
                    border: `1px solid ${lead.downloaded ? "#10b98130" : "#f59e0b30"}`,
                  }}
                >
                  <IcDownload />{" "}
                  {lead.downloaded ? "Downloaded" : "Not Downloaded"} — tap to
                  toggle
                </button>

                {lead.remarks && (
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 12,
                      color: "var(--p-text-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📝 {lead.remarks}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href={`tel:${lead.mobileNo}`}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "9px 0",
                      borderRadius: 10,
                      background: "#10b98115",
                      color: "#10b981",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid #10b98130",
                    }}
                  >
                    <IcPhone /> Call
                  </a>
                  <a
                    href={`https://wa.me/91${lead.mobileNo}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "9px 0",
                      borderRadius: 10,
                      background: "#25D36615",
                      color: "#25D366",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid #25D36630",
                    }}
                  >
                    <IcWhatsapp /> WA
                  </a>
                  <button
                    onClick={() => setFormModal(lead)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "9px 0",
                      borderRadius: 10,
                      background: "#6366f115",
                      color: "#a5b4fc",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid #6366f130",
                      cursor: "pointer",
                    }}
                  >
                    <IcEdit /> Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(lead)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "9px 0",
                      borderRadius: 10,
                      background: "#ef444415",
                      color: "#ef4444",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid #ef444430",
                      cursor: "pointer",
                    }}
                  >
                    <IcTrash /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PAGINATION ───────────────────────────────────────────────────── */}
      <Paginator
        total={filteredLeads.length}
        page={safePage}
        perPage={PAGE_SIZE}
        onChange={setPage}
      />

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      {formModal && (
        <LeadFormModal
          initial={formModal === true ? null : formModal}
          onClose={() => setFormModal(null)}
          onSave={handleSave}
          checkDuplicate={checkDuplicate}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          lead={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      <Toast toast={toast} />

      <style>{`
        @media (max-width: 768px) {
          .freshlead-table-wrap { display: none !important; }
          .freshlead-card-list { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

// ── style helpers ────────────────────────────────────────────────────────────
function th() {
  return {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--p-text-4)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    textAlign: "left",
    borderBottom: "2px solid var(--p-border)",
    whiteSpace: "nowrap",
  };
}
function td() {
  return {
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--p-text)",
    borderBottom: "1px solid var(--p-border)",
  };
}
