import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../Firebase";
import Paginator from "./Paginator";

const TEAM_PER_PAGE = 10;

const ALL_TABS = [
  { id: "dashboard", label: "Commission Dashboard",  desc: "Earnings, stats & commission overview" },
  { id: "reports",   label: "Monthly Report",        desc: "Month-wise subscription & revenue report" },
  { id: "leads",     label: "Lead Management",       desc: "New users, renewals, early expiry & follow-ups" },
  { id: "freshleads", label: "Fresh Lead",           desc: "Manually added leads — add, edit, call & follow up" },
];

const DEFAULT_FORM = {
  name: "",
  mobile: "",
  active: true,
  tabs: ["dashboard"],
};

function validate(form) {
  const e = {};
  if (!form.name.trim()) e.name = "Required";
  if (!/^\d{10}$/.test(form.mobile)) e.mobile = "10 digits required";
  if (!form.tabs.length) e.tabs = "Assign at least one tab";
  return e;
}

export default function TeamUserManagement({ mteamId }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [teamPage, setTeamPage]   = useState(1);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "mteam", mteamId));
      if (snap.exists()) {
        setTeam(snap.data().team ?? []);
      }
    } catch (err) {
      console.error("Fetch team error:", err);
    } finally {
      setLoading(false);
    }
  }, [mteamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const c = { ...prev }; delete c[field]; return c; });
  };

  const toggleTab = (tabId) => {
    setForm((prev) => {
      const has = prev.tabs.includes(tabId);
      const tabs = has ? prev.tabs.filter((t) => t !== tabId) : [...prev.tabs, tabId];
      return { ...prev, tabs };
    });
    setErrors((prev) => { const c = { ...prev }; delete c.tabs; return c; });
  };

  const openAdd = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setEditIndex(null);
    setShowForm(true);
  };

  const openEdit = (idx) => {
    const u = team[idx];
    setForm({
      name: u.name,
      mobile: u.mobile,
      active: u.active ?? true,
      tabs: u.tabs ?? ["dashboard"],
    });
    setErrors({});
    setEditIndex(idx);
    setShowForm(true);
  };

  const handleSave = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editIndex === null) {
      const duplicate = team.find((u, i) => u.mobile === form.mobile);
      if (duplicate) {
        setErrors({ mobile: "Mobile already exists in team" });
        return;
      }
    } else {
      const duplicate = team.find((u, i) => u.mobile === form.mobile && i !== editIndex);
      if (duplicate) {
        setErrors({ mobile: "Mobile already exists in team" });
        return;
      }
    }

    setSaving(true);
    try {
      let newTeam;
      if (editIndex === null) {
        newTeam = [...team, { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
      } else {
        newTeam = team.map((u, i) =>
          i === editIndex ? { ...u, ...form, updatedAt: new Date().toISOString() } : u
        );
      }
      newTeam = newTeam.map(({ password: _legacyPassword, _showPw, ...u }) => u);
      await updateDoc(doc(db, "mteam", mteamId), {
        team: newTeam,
        updatedAt: serverTimestamp(),
      });
      setTeam(newTeam);
      setShowForm(false);
      setEditIndex(null);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idx) => {
    setSaving(true);
    try {
      const newTeam = team.filter((_, i) => i !== idx).map(({ password: _legacyPassword, ...u }) => u);
      await updateDoc(doc(db, "mteam", mteamId), {
        team: newTeam,
        updatedAt: serverTimestamp(),
      });
      setTeam(newTeam);
      setDeleteIdx(null);
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (idx) => {
    const newTeam = team.map((u, i) =>
      i === idx ? { ...u, active: !u.active } : u
    ).map(({ password: _legacyPassword, ...u }) => u);
    setTeam(newTeam);
    try {
      await updateDoc(doc(db, "mteam", mteamId), { team: newTeam });
    } catch (err) {
      console.error(err);
      setTeam(team);
    }
  };

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
        <p style={{ color: "#64748b", marginTop: 14, fontSize: 14 }}>Loading team…</p>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>My Team</h2>
          <p style={s.sub}>Create team members and assign portal access tabs</p>
        </div>
        <button style={s.addBtn} onClick={openAdd}>
          + Add Member
        </button>
      </div>

      {showForm && (
        <div style={s.formCard}>
          <h3 style={s.formTitle}>{editIndex === null ? "Add New Member" : "Edit Member"}</h3>

          <div style={s.formGrid}>
            <div style={s.field}>
              <label style={s.label}>Full Name</label>
              <input
                style={{ ...s.input, ...(errors.name ? s.inputErr : {}) }}
                placeholder="Full Name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
              {errors.name && <span style={s.err}>{errors.name}</span>}
            </div>

            <div style={s.field}>
              <label style={s.label}>Mobile</label>
              <input
                style={{ ...s.input, ...(errors.mobile ? s.inputErr : {}) }}
                placeholder="10-digit mobile"
                type="tel"
                maxLength={10}
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              {errors.mobile && <span style={s.err}>{errors.mobile}</span>}
            </div>

          </div>

          <div style={{ marginTop: 20 }}>
            <label style={s.label}>Assign Portal Tabs</label>
            <p style={{ margin:"4px 0 10px", fontSize:12, color:"#64748b" }}>
              Select which sections this sub-user can access after login.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {ALL_TABS.map((tab) => {
                const selected = form.tabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => toggleTab(tab.id)}
                    style={{
                      display:"flex", alignItems:"center", gap:14,
                      padding:"12px 16px", borderRadius:10, cursor:"pointer", textAlign:"left",
                      transition:"all 0.15s",
                      background: selected ? "#6366f115" : "#0f172a",
                      border: selected ? "1.5px solid #6366f1" : "1.5px solid #334155",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width:20, height:20, borderRadius:5, flexShrink:0,
                      border: selected ? "2px solid #6366f1" : "2px solid #334155",
                      background: selected ? "#6366f1" : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      transition:"all 0.15s",
                    }}>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color: selected ? "#a5b4fc" : "#94a3b8" }}>
                        {tab.label}
                      </p>
                      <p style={{ margin:"2px 0 0", fontSize:11, color:"#475569" }}>{tab.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.tabs && <span style={s.err}>{errors.tabs}</span>}
          </div>

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <label style={s.label}>Active</label>
            <button
              type="button"
              onClick={() => set("active", !form.active)}
              style={{
                ...s.toggle,
                background: form.active ? "#6366f1" : "#334155",
              }}
            >
              <span
                style={{
                  ...s.toggleThumb,
                  transform: form.active ? "translateX(20px)" : "translateX(2px)",
                }}
              />
            </button>
            <span style={{ color: form.active ? "#a5b4fc" : "#64748b", fontSize: 13 }}>
              {form.active ? "Active" : "Inactive"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              style={{ ...s.btn, background: saving ? "#4338ca80" : "#6366f1" }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : editIndex === null ? "Create Member" : "Save Changes"}
            </button>
            <button
              style={{ ...s.btn, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8" }}
              onClick={() => { setShowForm(false); setEditIndex(null); }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {team.length === 0 && !showForm && (
        <div style={s.empty}>
          <span style={{ fontSize: 40 }}>👥</span>
          <p style={{ color: "#475569", marginTop: 10 }}>No team members yet. Click "Add Member" to get started.</p>
        </div>
      )}

      {team.length > 0 && (() => {
        const pageSlice = team.slice((teamPage - 1) * TEAM_PER_PAGE, teamPage * TEAM_PER_PAGE);
        return (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
              {pageSlice.map((user, relIdx) => {
                const idx = (teamPage - 1) * TEAM_PER_PAGE + relIdx;
                return (
                  <div key={idx} style={s.memberCard}>
                    <div style={s.memberLeft}>
                      <div style={s.avatar}>{user.name?.[0]?.toUpperCase() ?? "?"}</div>
                      <div>
                        <p style={s.memberName}>{user.name}</p>
                        <p style={s.memberMobile}>📱 {user.mobile}</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {(user.tabs ?? ["dashboard"]).map((t) => {
                            const tab = ALL_TABS.find((a) => a.id === t);
                            return (
                              <span key={t} style={s.tabBadge}>
                                {tab?.label ?? t}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        ...s.statusBadge,
                        background: user.active ? "#10b98120" : "#ef444420",
                        color: user.active ? "#10b981" : "#ef4444",
                        border: `1px solid ${user.active ? "#10b98140" : "#ef444440"}`,
                      }}>
                        {user.active ? "Active" : "Inactive"}
                      </span>
                      <button style={s.iconBtn} title="Toggle active" onClick={() => toggleActive(idx)}>⏸</button>
                      <button style={s.iconBtn} title="Edit" onClick={() => openEdit(idx)}>✏️</button>
                      <button style={{ ...s.iconBtn, color: "#ef4444" }} title="Delete" onClick={() => setDeleteIdx(idx)}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Paginator
              total={team.length}
              page={teamPage}
              perPage={TEAM_PER_PAGE}
              onChange={(p) => setTeamPage(p)}
            />
          </>
        );
      })()}

      {deleteIdx !== null && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>Delete Member?</p>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
              Are you sure you want to remove <strong style={{ color: "#a5b4fc" }}>{team[deleteIdx]?.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                style={{ ...s.btn, background: "#ef4444" }}
                onClick={() => handleDelete(deleteIdx)}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
              <button
                style={{ ...s.btn, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8" }}
                onClick={() => setDeleteIdx(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  root: {
    padding: "28px 24px",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    maxWidth: 900,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 800, color: "#e2e8f0" },
  sub: { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  addBtn: {
    padding: "10px 20px",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  formCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: "24px",
    marginBottom: 24,
  },
  formTitle: { margin: "0 0 20px", color: "#a5b4fc", fontWeight: 700, fontSize: 16 },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
    gap: 16,
  },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" },
  input: {
    padding: "10px 12px",
    background: "#0f172a",
    border: "1.5px solid #334155",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
  },
  inputErr: { borderColor: "#ef4444" },
  err: { color: "#f87171", fontSize: 11, marginTop: 2 },
  tabChip: {
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    position: "relative",
    transition: "background 0.2s",
    padding: 0,
  },
  toggleThumb: {
    position: "absolute",
    top: 2,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform 0.2s",
    display: "block",
  },
  btn: {
    padding: "10px 20px",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  memberCard: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 14,
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  memberLeft: { display: "flex", alignItems: "flex-start", gap: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 18,
    flexShrink: 0,
  },
  memberName: { margin: 0, fontWeight: 700, color: "#e2e8f0", fontSize: 15 },
  memberMobile: { margin: "2px 0 0", color: "#64748b", fontSize: 13 },
  tabBadge: {
    padding: "3px 10px",
    background: "#6366f115",
    border: "1px solid #6366f140",
    borderRadius: 20,
    color: "#a5b4fc",
    fontSize: 11,
    fontWeight: 600,
  },
  statusBadge: {
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: "4px 6px",
    borderRadius: 6,
    transition: "background 0.15s",
  },
  empty: {
    textAlign: "center",
    padding: "60px 20px",
    background: "#1e293b",
    border: "1px dashed #334155",
    borderRadius: 16,
    marginTop: 24,
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 20px",
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "3px solid #1e293b",
    borderTopColor: "#6366f1",
    animation: "spin 0.8s linear infinite",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 28,
    maxWidth: 400,
    width: "90%",
  },
};
