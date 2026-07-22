import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../Firebase";
import { COLL } from "../../Utils/collections";

const STATUSES = ["Initiated", "Pending", "Completed"];
const PAGE_SIZES = [10, 20, 50];

const STATUS_META = {
  Initiated: { className: "tm-status-initiated", label: "Initiated" },
  Pending: { className: "tm-status-pending", label: "Pending" },
  Completed: { className: "tm-status-completed", label: "Completed" },
};

function localDateValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(toMillis(value) || value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TasksIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h11M9 12h11M9 19h11" />
      <path d="m3.5 5 1 1 2-2M3.5 12l1 1 2-2M3.5 19l1 1 2-2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5" />
    </svg>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const first = Math.max(1, page - 2);
  const last = Math.min(totalPages, page + 2);
  for (let number = first; number <= last; number += 1) pages.push(number);

  return (
    <div className="tm-pagination" aria-label="Task pagination">
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button>
      {first > 1 && (
        <>
          <button type="button" onClick={() => onChange(1)}>1</button>
          {first > 2 && <span>…</span>}
        </>
      )}
      {pages.map((number) => (
        <button
          type="button"
          key={number}
          className={number === page ? "active" : ""}
          aria-current={number === page ? "page" : undefined}
          onClick={() => onChange(number)}
        >
          {number}
        </button>
      ))}
      {last < totalPages && (
        <>
          {last < totalPages - 1 && <span>…</span>}
          <button type="button" onClick={() => onChange(totalPages)}>{totalPages}</button>
        </>
      )}
      <button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

function TaskFormDialog({ task, saving, onSave, onClose }) {
  const editing = Boolean(task);
  const [form, setForm] = useState({
    name: task?.name || "",
    taskDate: task?.taskDate || localDateValue(),
    description: task?.description || "",
    companyName: task?.companyName || "",
    status: STATUSES.includes(task?.status) ? task.status : "Initiated",
  });
  const [error, setError] = useState("");

  const set = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      taskDate: form.taskDate,
      description: form.description.trim(),
      companyName: form.companyName.trim(),
      status: form.status,
    };

    if (!payload.name || !payload.taskDate || !payload.description) {
      setError("Task name, date and description are required.");
      return;
    }

    try {
      await onSave(payload);
    } catch {
      setError("Task could not be saved. Please try again.");
    }
  };

  return (
    <div className="tm-modal-backdrop" role="presentation">
      <div className="tm-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        <div className="tm-modal-head">
          <div>
            <h2 id="task-form-title">{editing ? "Edit Task" : "Create New Task"}</h2>
            <p>This task will be visible to the company admin.</p>
          </div>
          <button type="button" className="tm-close" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </div>

        <form className="tm-form" onSubmit={submit}>
          <div className="tm-form-grid">
            <label className="tm-field">
              <span>Task Name *</span>
              <input
                autoFocus
                value={form.name}
                maxLength={120}
                placeholder="Example: Review new company templates"
                onChange={(event) => set("name", event.target.value)}
              />
            </label>

            <label className="tm-field">
              <span>Task Date *</span>
              <input type="date" value={form.taskDate} onChange={(event) => set("taskDate", event.target.value)} />
            </label>
          </div>

          <div className="tm-form-grid">
            <label className="tm-field">
              <span>Company Name <small>(optional)</small></span>
              <input
                value={form.companyName}
                maxLength={150}
                placeholder="Company name"
                onChange={(event) => set("companyName", event.target.value)}
              />
            </label>

            <label className="tm-field">
              <span>Status *</span>
              <select value={form.status} onChange={(event) => set("status", event.target.value)}>
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>

          <label className="tm-field">
            <span>Description *</span>
            <textarea
              rows={5}
              value={form.description}
              maxLength={2000}
              placeholder="Write complete task details for the admin team…"
              onChange={(event) => set("description", event.target.value)}
            />
            <small className="tm-counter">{form.description.length}/2000</small>
          </label>

          {error && <p className="tm-form-error">{error}</p>}

          <div className="tm-modal-actions">
            <button type="button" className="tm-btn tm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="tm-btn tm-btn-primary" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TaskManagement({ mteamSession }) {
  const mteamId = mteamSession?.mteamId || "";
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!mteamId) {
      setLoadError("Marketing team identity is missing. Please sign in again.");
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setLoadError("");
    const taskQuery = query(
      collection(db, COLL.TASKM),
      where("createdByMteamId", "==", mteamId),
    );

    const unsubscribe = onSnapshot(
      taskQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        items.sort((a, b) => (
          String(b.taskDate || "").localeCompare(String(a.taskDate || ""))
          || toMillis(b.createdAt) - toMillis(a.createdAt)
        ));
        setTasks(items);
        setSelected((previous) => {
          const validIds = new Set(items.map((item) => item.id));
          return new Set(Array.from(previous).filter((id) => validIds.has(id)));
        });
        setLoading(false);
      },
      (error) => {
        console.error("Task subscription failed:", error);
        setLoadError("Tasks could not be loaded. Deploy the included Firestore rules and try again.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [mteamId, reloadKey]);

  const filteredTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter && task.status !== statusFilter) return false;
      if (dateFrom && String(task.taskDate || "") < dateFrom) return false;
      if (dateTo && String(task.taskDate || "") > dateTo) return false;
      if (!needle) return true;
      return [task.name, task.description, task.companyName, task.createdByName]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [tasks, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageTasks = useMemo(
    () => filteredTasks.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredTasks, safePage, pageSize],
  );

  const setFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const showFeedback = (type, message) => setFeedback({ type, message });

  const saveTask = async (payload) => {
    setSaving(true);
    setFeedback(null);
    try {
      if (dialog?.mode === "edit" && dialog.task) {
        await updateDoc(doc(db, COLL.TASKM, dialog.task.id), {
          ...payload,
          updatedAt: serverTimestamp(),
          updatedByUid: mteamSession.uid || "",
          updatedByName: mteamSession.name || "Marketing Member",
          updatedByPanel: "marketing",
        });
        showFeedback("success", "Task updated successfully. Admin can see the latest changes.");
      } else {
        await addDoc(collection(db, COLL.TASKM), {
          ...payload,
          createdByMteamId: mteamId,
          createdByUid: mteamSession.uid || "",
          createdByName: mteamSession.name || "Marketing Member",
          createdByMobile: mteamSession.mobile || mteamSession.parentMobile || "",
          createdByRole: mteamSession.role || "member",
          createdByPanel: "marketing",
          assignedPanel: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedByUid: mteamSession.uid || "",
          updatedByName: mteamSession.name || "Marketing Member",
          updatedByPanel: "marketing",
        });
        showFeedback("success", "Task created and sent to the company admin.");
      }
      setDialog(null);
    } catch (error) {
      console.error("Save task failed:", error);
      showFeedback("error", "Task could not be saved. Please check access and try again.");
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task, nextStatus) => {
    if (!STATUSES.includes(nextStatus) || nextStatus === task.status) return;
    const previousStatus = task.status;
    setBusyTaskId(task.id);
    setFeedback(null);
    setTasks((items) => items.map((item) => (
      item.id === task.id ? { ...item, status: nextStatus } : item
    )));
    try {
      await updateDoc(doc(db, COLL.TASKM, task.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        updatedByUid: mteamSession.uid || "",
        updatedByName: mteamSession.name || "Marketing Member",
        updatedByPanel: "marketing",
      });
      showFeedback("success", `Task marked ${nextStatus}.`);
    } catch (error) {
      console.error("Update status failed:", error);
      setTasks((items) => items.map((item) => (
        item.id === task.id ? { ...item, status: previousStatus } : item
      )));
      showFeedback("error", "Task status could not be updated.");
    } finally {
      setBusyTaskId("");
    }
  };

  const deleteTasks = async (ids) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (!uniqueIds.length) return;
    const description = uniqueIds.length === 1 ? "this task" : `${uniqueIds.length} selected tasks`;
    if (!window.confirm(`Delete ${description}? This cannot be undone.`)) return;

    setDeleting(true);
    setFeedback(null);
    try {
      if (uniqueIds.length === 1) {
        await deleteDoc(doc(db, COLL.TASKM, uniqueIds[0]));
      } else {
        for (let start = 0; start < uniqueIds.length; start += 450) {
          const batch = writeBatch(db);
          uniqueIds.slice(start, start + 450).forEach((id) => {
            batch.delete(doc(db, COLL.TASKM, id));
          });
          await batch.commit();
        }
      }
      const removed = new Set(uniqueIds);
      setTasks((items) => items.filter((item) => !removed.has(item.id)));
      setSelected((previous) => new Set(Array.from(previous).filter((id) => !removed.has(id))));
      showFeedback("success", uniqueIds.length === 1 ? "Task deleted." : `${uniqueIds.length} tasks deleted.`);
    } catch (error) {
      console.error("Delete tasks failed:", error);
      showFeedback("error", "Selected task(s) could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const pageSelected = pageTasks.length > 0 && pageTasks.every((task) => selected.has(task.id));
  const togglePage = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      pageTasks.forEach((task) => {
        if (pageSelected) next.delete(task.id);
        else next.add(task.id);
      });
      return next;
    });
  };
  const toggleOne = (id) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtersActive = Boolean(search || statusFilter || dateFrom || dateTo);

  return (
    <div className="tm-page">
      <div className="tm-header">
        <div className="tm-title-wrap">
          <span className="tm-title-icon"><TasksIcon size={23} /></span>
          <div>
            <h1>Task Management</h1>
            <p>Create and track tasks sent to the company admin.</p>
          </div>
        </div>
        <div className="tm-header-actions">
          <button type="button" className="tm-btn tm-btn-secondary" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>
            <RefreshIcon /> {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="tm-btn tm-btn-primary" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon /> Add Task
          </button>
        </div>
      </div>

      <div className="tm-stat-grid">
        {[
          ["Total Tasks", tasks.length, "tm-total"],
          ["Initiated", tasks.filter((task) => task.status === "Initiated").length, "tm-blue"],
          ["Pending", tasks.filter((task) => task.status === "Pending").length, "tm-amber"],
          ["Completed", tasks.filter((task) => task.status === "Completed").length, "tm-green"],
        ].map(([label, value, className]) => (
          <div className={`tm-stat-card ${className}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <section className="tm-filter-card">
        <div className="tm-filters">
          <label className="tm-search">
            <SearchIcon />
            <input
              value={search}
              placeholder="Search task, description or company…"
              onChange={(event) => setFilter(setSearch, event.target.value)}
            />
          </label>
          <select value={statusFilter} aria-label="Filter by status" onChange={(event) => setFilter(setStatusFilter, event.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <label className="tm-date-filter">
            <span>From</span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setFilter(setDateFrom, event.target.value)} />
          </label>
          <label className="tm-date-filter">
            <span>To</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setFilter(setDateTo, event.target.value)} />
          </label>
          <button type="button" className="tm-clear" onClick={clearFilters} disabled={!filtersActive}>Clear</button>
        </div>

        <div className="tm-filter-footer">
          <span>{filteredTasks.length} matching task{filteredTasks.length === 1 ? "" : "s"}</span>
          {selected.size > 0 && (
            <button type="button" className="tm-btn tm-btn-danger" disabled={deleting} onClick={() => deleteTasks(Array.from(selected))}>
              <TrashIcon /> {deleting ? "Deleting…" : `Delete Selected (${selected.size})`}
            </button>
          )}
        </div>
      </section>

      {feedback && (
        <div className={`tm-feedback ${feedback.type}`} role="status">
          <span>{feedback.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}
      {loadError && <div className="tm-feedback error" role="alert">{loadError}</div>}

      <section className="tm-list-card">
        {loading ? (
          <div className="tm-empty"><span className="tm-spinner" /><p>Loading tasks…</p></div>
        ) : pageTasks.length === 0 ? (
          <div className="tm-empty">
            <span className="tm-empty-icon"><TasksIcon size={28} /></span>
            <h3>{filtersActive ? "No matching tasks" : "No tasks created yet"}</h3>
            <p>{filtersActive ? "Try changing or clearing the filters." : "Create your first task and send it to the admin team."}</p>
            {!filtersActive && <button type="button" className="tm-btn tm-btn-primary" onClick={() => setDialog({ mode: "create" })}><PlusIcon /> Add First Task</button>}
          </div>
        ) : (
          <>
            <div className="tm-table-wrap">
              <table className="tm-table">
                <thead>
                  <tr>
                    <th className="tm-check-cell"><input type="checkbox" checked={pageSelected} onChange={togglePage} aria-label="Select all tasks on this page" /></th>
                    <th>Task</th>
                    <th>Company</th>
                    <th>Task Date</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th className="tm-actions-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageTasks.map((task) => {
                    const statusMeta = STATUS_META[task.status] || STATUS_META.Initiated;
                    return (
                      <tr key={task.id}>
                        <td className="tm-check-cell"><input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleOne(task.id)} aria-label={`Select ${task.name}`} /></td>
                        <td>
                          <strong className="tm-task-name">{task.name || "Untitled task"}</strong>
                          <p className="tm-description" title={task.description}>{task.description || "—"}</p>
                        </td>
                        <td>{task.companyName ? <span className="tm-company">{task.companyName}</span> : <span className="tm-muted">Not specified</span>}</td>
                        <td className="tm-nowrap">{formatDate(task.taskDate)}</td>
                        <td>
                          <select
                            className={`tm-status-select ${statusMeta.className}`}
                            value={task.status || "Initiated"}
                            disabled={busyTaskId === task.id}
                            aria-label={`Status for ${task.name}`}
                            onChange={(event) => updateStatus(task, event.target.value)}
                          >
                            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </td>
                        <td>
                          <span className="tm-nowrap">{formatDate(task.updatedAt || task.createdAt)}</span>
                          {task.updatedByName && <small className="tm-updated-by">by {task.updatedByName}</small>}
                        </td>
                        <td>
                          <div className="tm-row-actions">
                            <button type="button" className="tm-icon-btn edit" title="Edit task" onClick={() => setDialog({ mode: "edit", task })}><EditIcon /></button>
                            <button type="button" className="tm-icon-btn delete" title="Delete task" disabled={deleting} onClick={() => deleteTasks([task.id])}><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="tm-mobile-list">
              {pageTasks.map((task) => {
                const statusMeta = STATUS_META[task.status] || STATUS_META.Initiated;
                return (
                  <article className="tm-mobile-card" key={task.id}>
                    <div className="tm-mobile-card-head">
                      <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleOne(task.id)} aria-label={`Select ${task.name}`} />
                      <div>
                        <h3>{task.name || "Untitled task"}</h3>
                        <span>{formatDate(task.taskDate)}</span>
                      </div>
                      <span className="tm-admin-badge">Admin</span>
                    </div>
                    <p className="tm-mobile-desc">{task.description || "—"}</p>
                    <div className="tm-mobile-meta">
                      <span><b>Company:</b> {task.companyName || "Not specified"}</span>
                      <span><b>Updated:</b> {formatDate(task.updatedAt || task.createdAt)}</span>
                    </div>
                    <div className="tm-mobile-actions">
                      <select
                        className={`tm-status-select ${statusMeta.className}`}
                        value={task.status || "Initiated"}
                        disabled={busyTaskId === task.id}
                        onChange={(event) => updateStatus(task, event.target.value)}
                      >
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <button type="button" className="tm-icon-btn edit" onClick={() => setDialog({ mode: "edit", task })}><EditIcon /> <span>Edit</span></button>
                      <button type="button" className="tm-icon-btn delete" disabled={deleting} onClick={() => deleteTasks([task.id])}><TrashIcon /></button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="tm-list-footer">
              <label>
                Show
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                  {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                per page
              </label>
              <span className="tm-page-summary">
                Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredTasks.length)} of {filteredTasks.length}
              </span>
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </section>

      {dialog && (
        <TaskFormDialog
          key={dialog.mode === "edit" ? dialog.task.id : "new-task"}
          task={dialog.mode === "edit" ? dialog.task : null}
          saving={saving}
          onSave={saveTask}
          onClose={() => { if (!saving) setDialog(null); }}
        />
      )}

      <style>{`
        .tm-page { max-width: 1380px; margin: 0 auto; padding: 24px; color: var(--p-text); animation: fadeUp .25s ease; }
        .tm-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
        .tm-title-wrap { display:flex; align-items:center; gap:12px; min-width:0; }
        .tm-title-icon { width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:#6366f1; background:#6366f118; border:1px solid #6366f130; flex-shrink:0; }
        .tm-title-wrap h1 { margin:0; font-size:24px; line-height:1.2; letter-spacing:-.4px; }
        .tm-title-wrap p { margin:5px 0 0; color:var(--p-text-3); font-size:13px; }
        .tm-header-actions { display:flex; gap:9px; flex-shrink:0; }
        .tm-btn { min-height:40px; border-radius:11px; padding:0 15px; border:1px solid transparent; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .tm-btn:disabled { opacity:.55; cursor:not-allowed; }
        .tm-btn-primary { color:#fff; background:linear-gradient(135deg,#6366f1,#7c3aed); box-shadow:0 6px 18px #6366f125; }
        .tm-btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 8px 22px #6366f135; }
        .tm-btn-secondary { color:var(--p-text-2); background:var(--p-card); border-color:var(--p-border); }
        .tm-btn-secondary:hover:not(:disabled) { border-color:#6366f170; color:#6366f1; }
        .tm-btn-danger { color:#dc2626; background:#ef444412; border-color:#ef444435; min-height:36px; }
        .tm-stat-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
        .tm-stat-card { position:relative; overflow:hidden; padding:16px 18px; border-radius:15px; background:var(--p-card); border:1px solid var(--p-border); }
        .tm-stat-card::after { content:""; position:absolute; width:70px; height:70px; border-radius:50%; right:-25px; bottom:-35px; background:currentColor; opacity:.07; }
        .tm-stat-card span { display:block; color:var(--p-text-3); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
        .tm-stat-card strong { display:block; margin-top:5px; font-size:27px; line-height:1; }
        .tm-stat-card.tm-total { color:var(--p-text); }
        .tm-stat-card.tm-blue { color:#0284c7; }
        .tm-stat-card.tm-amber { color:#d97706; }
        .tm-stat-card.tm-green { color:#059669; }
        .tm-filter-card, .tm-list-card { border-radius:16px; background:var(--p-card); border:1px solid var(--p-border); box-shadow:0 3px 14px rgba(15,23,42,.025); }
        .tm-filter-card { padding:14px; margin-bottom:14px; }
        .tm-filters { display:grid; grid-template-columns:minmax(240px,1fr) 155px minmax(145px,170px) minmax(145px,170px) auto; gap:10px; align-items:stretch; }
        .tm-search { position:relative; display:flex; align-items:center; }
        .tm-search svg { position:absolute; left:12px; color:var(--p-text-4); pointer-events:none; }
        .tm-search input { padding-left:37px !important; width:100%; }
        .tm-filters input, .tm-filters select, .tm-field input, .tm-field select, .tm-field textarea, .tm-list-footer select { border:1px solid var(--p-border); background:var(--p-input); color:var(--p-text); border-radius:10px; outline:none; font:inherit; transition:border-color .15s, box-shadow .15s; }
        .tm-filters input, .tm-filters select { min-height:41px; padding:0 11px; font-size:12px; }
        .tm-filters input:focus, .tm-filters select:focus, .tm-field input:focus, .tm-field select:focus, .tm-field textarea:focus { border-color:#6366f1; box-shadow:0 0 0 3px #6366f116; }
        .tm-date-filter { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:7px; min-height:41px; padding-left:10px; border:1px solid var(--p-border); border-radius:10px; background:var(--p-input); }
        .tm-date-filter span { color:var(--p-text-4); font-size:10px; font-weight:800; text-transform:uppercase; }
        .tm-date-filter input { border:0; min-width:0; padding-left:0; background:transparent; }
        .tm-date-filter input:focus { box-shadow:none; }
        .tm-clear { border:0; background:transparent; color:#6366f1; font-size:12px; font-weight:700; cursor:pointer; padding:0 8px; }
        .tm-clear:disabled { color:var(--p-text-4); cursor:not-allowed; }
        .tm-filter-footer { display:flex; justify-content:space-between; align-items:center; gap:10px; min-height:25px; margin-top:10px; color:var(--p-text-4); font-size:11px; }
        .tm-feedback { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 14px; border-radius:11px; margin-bottom:14px; font-size:12px; font-weight:600; border:1px solid; }
        .tm-feedback.success { color:#047857; background:#10b98110; border-color:#10b98135; }
        .tm-feedback.error { color:#dc2626; background:#ef444410; border-color:#ef444435; }
        .tm-feedback button { border:0; background:transparent; color:inherit; font-size:20px; cursor:pointer; line-height:1; }
        .tm-list-card { overflow:hidden; }
        .tm-table-wrap { overflow-x:auto; }
        .tm-table { width:100%; border-collapse:collapse; min-width:1040px; font-size:12px; }
        .tm-table th { padding:11px 12px; text-align:left; color:var(--p-text-3); background:var(--p-card2); border-bottom:1px solid var(--p-border); text-transform:uppercase; letter-spacing:.045em; font-size:10px; white-space:nowrap; }
        .tm-table td { padding:13px 12px; border-bottom:1px solid var(--p-border-s); vertical-align:middle; color:var(--p-text-2); }
        .tm-table tbody tr:hover { background:#6366f108; }
        .tm-table tbody tr:last-child td { border-bottom:0; }
        .tm-check-cell { width:42px; text-align:center !important; }
        .tm-check-cell input, .tm-mobile-card input[type="checkbox"] { width:16px; height:16px; accent-color:#6366f1; cursor:pointer; }
        .tm-task-name { display:block; max-width:300px; color:var(--p-text); font-size:13px; }
        .tm-description { max-width:330px; margin:4px 0 0; color:var(--p-text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-company { display:inline-block; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:4px 8px; border-radius:7px; color:#4f46e5; background:#6366f110; font-weight:600; }
        .tm-muted { color:var(--p-text-4); font-style:italic; }
        .tm-nowrap { white-space:nowrap; }
        .tm-updated-by { display:block; max-width:130px; margin-top:3px; color:var(--p-text-4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-status-select { min-width:108px; height:31px; border-radius:999px; padding:0 9px; outline:none; font-size:11px; font-weight:700; cursor:pointer; }
        .tm-status-initiated { color:#0369a1; background:#0ea5e915; border:1px solid #0ea5e940; }
        .tm-status-pending { color:#b45309; background:#f59e0b15; border:1px solid #f59e0b45; }
        .tm-status-completed { color:#047857; background:#10b98115; border:1px solid #10b98145; }
        .tm-actions-head { text-align:center !important; }
        .tm-row-actions { display:flex; justify-content:center; gap:6px; }
        .tm-icon-btn { min-width:32px; height:32px; padding:0 8px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; background:transparent; transition:all .15s; }
        .tm-icon-btn.edit { color:#4f46e5; border:1px solid #6366f135; }
        .tm-icon-btn.delete { color:#dc2626; border:1px solid #ef444435; }
        .tm-icon-btn:hover:not(:disabled) { transform:translateY(-1px); background:var(--p-card2); }
        .tm-icon-btn:disabled { opacity:.45; cursor:not-allowed; }
        .tm-list-footer { min-height:58px; padding:10px 14px; border-top:1px solid var(--p-border); display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; color:var(--p-text-3); font-size:11px; }
        .tm-list-footer > label { display:flex; align-items:center; gap:7px; }
        .tm-list-footer select { height:31px; padding:0 7px; }
        .tm-page-summary { text-align:center; }
        .tm-pagination { display:flex; justify-content:flex-end; align-items:center; gap:4px; }
        .tm-pagination button { min-width:31px; height:31px; padding:0 9px; border-radius:8px; border:1px solid var(--p-border); background:var(--p-card); color:var(--p-text-2); font-size:11px; cursor:pointer; }
        .tm-pagination button.active { color:#fff; border-color:#6366f1; background:#6366f1; }
        .tm-pagination button:disabled { opacity:.4; cursor:not-allowed; }
        .tm-pagination span { color:var(--p-text-4); }
        .tm-empty { min-height:330px; padding:45px 20px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--p-text-3); }
        .tm-empty-icon { width:58px; height:58px; border-radius:18px; display:flex; align-items:center; justify-content:center; margin-bottom:13px; color:#6366f1; background:#6366f110; }
        .tm-empty h3 { margin:0; color:var(--p-text); font-size:16px; }
        .tm-empty p { max-width:360px; margin:7px 0 16px; font-size:12px; }
        .tm-spinner { width:30px; height:30px; border-radius:50%; border:3px solid #6366f130; border-top-color:#6366f1; animation:spin .75s linear infinite; }
        .tm-mobile-list { display:none; }
        .tm-modal-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(2,6,23,.65); backdrop-filter:blur(5px); }
        .tm-modal { width:min(620px,100%); max-height:calc(100vh - 36px); overflow:auto; border-radius:18px; background:var(--p-card); color:var(--p-text); border:1px solid var(--p-border); box-shadow:0 24px 80px rgba(0,0,0,.35); animation:fadeUp .2s ease; }
        .tm-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:15px; padding:18px 20px; border-bottom:1px solid var(--p-border); }
        .tm-modal-head h2 { margin:0; font-size:18px; }
        .tm-modal-head p { margin:4px 0 0; color:var(--p-text-3); font-size:11px; }
        .tm-close { width:31px; height:31px; border-radius:9px; border:1px solid var(--p-border); background:var(--p-card2); color:var(--p-text-3); font-size:20px; cursor:pointer; }
        .tm-form { padding:20px; }
        .tm-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-bottom:13px; }
        .tm-field { position:relative; display:flex; flex-direction:column; gap:6px; margin-bottom:13px; }
        .tm-field > span { color:var(--p-text-2); font-size:11px; font-weight:700; }
        .tm-field > span small { color:var(--p-text-4); font-weight:500; }
        .tm-field input, .tm-field select { height:43px; padding:0 12px; font-size:13px; }
        .tm-field textarea { padding:11px 12px 24px; resize:vertical; min-height:118px; font-size:13px; }
        .tm-counter { position:absolute; right:10px; bottom:8px; color:var(--p-text-4); font-size:9px; }
        .tm-form-error { margin:0 0 12px; padding:9px 11px; border-radius:9px; color:#dc2626; background:#ef444410; font-size:11px; }
        .tm-modal-actions { display:flex; justify-content:flex-end; gap:9px; padding-top:4px; }
        @media (max-width:1050px) {
          .tm-filters { grid-template-columns:1fr 150px 1fr 1fr; }
          .tm-clear { grid-column:4; justify-self:end; min-height:28px; }
          .tm-list-footer { grid-template-columns:auto 1fr; }
          .tm-page-summary { text-align:right; }
          .tm-pagination { grid-column:1/-1; justify-content:center; }
        }
        @media (max-width:767px) {
          .tm-page { padding:14px 12px 86px; }
          .tm-header { align-items:stretch; flex-direction:column; }
          .tm-title-wrap h1 { font-size:20px; }
          .tm-title-icon { width:40px; height:40px; }
          .tm-header-actions { display:grid; grid-template-columns:1fr 1fr; }
          .tm-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
          .tm-stat-card { padding:13px 14px; }
          .tm-stat-card strong { font-size:23px; }
          .tm-filters { display:grid; grid-template-columns:1fr 1fr; }
          .tm-search { grid-column:1/-1; }
          .tm-filters > select { grid-column:1/-1; }
          .tm-date-filter { min-width:0; }
          .tm-clear { grid-column:1/-1; justify-self:stretch; min-height:32px; border-radius:8px; background:var(--p-card2); }
          .tm-filter-footer { align-items:flex-start; flex-direction:column; }
          .tm-filter-footer .tm-btn { width:100%; }
          .tm-table-wrap { display:none; }
          .tm-mobile-list { display:flex; flex-direction:column; gap:10px; padding:10px; }
          .tm-mobile-card { padding:13px; border-radius:13px; border:1px solid var(--p-border); background:var(--p-card2); }
          .tm-mobile-card-head { display:grid; grid-template-columns:auto 1fr auto; align-items:flex-start; gap:9px; }
          .tm-mobile-card-head h3 { margin:0; color:var(--p-text); font-size:13px; line-height:1.35; }
          .tm-mobile-card-head div > span { display:block; margin-top:3px; color:var(--p-text-4); font-size:10px; }
          .tm-admin-badge { padding:3px 7px; border-radius:6px; color:#4f46e5; background:#6366f112; font-size:9px; font-weight:800; text-transform:uppercase; }
          .tm-mobile-desc { margin:11px 0; padding:10px; border-radius:9px; background:var(--p-card); color:var(--p-text-2); font-size:11px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
          .tm-mobile-meta { display:flex; flex-direction:column; gap:4px; color:var(--p-text-3); font-size:10px; }
          .tm-mobile-meta b { color:var(--p-text-2); }
          .tm-mobile-actions { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:7px; margin-top:12px; padding-top:11px; border-top:1px solid var(--p-border); }
          .tm-mobile-actions .tm-status-select { width:100%; }
          .tm-list-footer { display:flex; flex-direction:column; align-items:stretch; }
          .tm-list-footer > label { justify-content:center; }
          .tm-page-summary { text-align:center; }
          .tm-pagination { flex-wrap:wrap; justify-content:center; }
          .tm-pagination button { padding:0 7px; }
          .tm-form-grid { grid-template-columns:1fr; gap:0; margin:0; }
          .tm-modal-backdrop { align-items:flex-end; padding:0; }
          .tm-modal { width:100%; max-height:92vh; border-radius:20px 20px 0 0; }
          .tm-modal-head, .tm-form { padding:16px; }
          .tm-modal-actions .tm-btn { flex:1; }
        }
      `}</style>
    </div>
  );
}
