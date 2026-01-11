import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";

/* ---------- SLA HELPERS ---------- */

const MS_IN_HOUR = 60 * 60 * 1000;
const urgencyRank = { high: 3, medium: 2, low: 1 };
const attentionOrder = { overdue: 0, delayed: 1, "on-time": 2 };

function hoursSince(ts) {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return (Date.now() - d.getTime()) / MS_IN_HOUR;
}

function getSlaFlag(issue) {
  if (issue.status === "open") {
    const openedAt = issue.statusHistory?.[0]?.at;
    if (openedAt && hoursSince(openedAt) > 24) return "delayed";
  }

  if (issue.status === "assigned") {
    const assigned = issue.statusHistory?.find((h) => h.status === "assigned");
    if (assigned && hoursSince(assigned.at) > 48) return "overdue";
  }

  return "on-time";
}

/* ---------- STAFF OPTIONS ---------- */

const STAFF_OPTIONS = [
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "wifi_team", label: "WiFi/Network Team" },
  { value: "mess_supervisor", label: "Mess Supervisor" },
  { value: "maintenance", label: "Maintenance/Carpenter" }
];

function staffLabel(v) {
  const found = STAFF_OPTIONS.find((x) => x.value === v);
  return found ? found.label : v || "Unassigned";
}

/* ---------- COMPONENT ---------- */

export default function AdminIssueList() {
  const [issues, setIssues] = useState([]);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");

  // ✅ NEW assignment filters
  const [filterAssignedTo, setFilterAssignedTo] = useState("all"); // all | unassigned | plumber...
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  /* ---------- REALTIME FETCH ---------- */
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (!user) return;

      const q = query(
        collection(db, "issues"),
        orderBy("urgencyScore", "desc"),
        orderBy("createdAt", "desc")
      );

      const unsubSnap = onSnapshot(q, (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setIssues(data);
      });

      return () => unsubSnap();
    });

    return () => unsubAuth();
  }, []);

  /* ---------- STATUS UPDATE ---------- */
  const updateStatus = async (issue, nextStatus) => {
    await updateDoc(doc(db, "issues", issue.id), {
      status: nextStatus,
      statusHistory: [
        ...(issue.statusHistory || []),
        { status: nextStatus, at: Timestamp.now() }
      ],
      updatedAt: serverTimestamp()
    });
  };

  /* ---------- ASSIGNMENT (NEW) ---------- */
  const assignIssue = async (issue, assignedToValue) => {
    const user = auth.currentUser;

    await updateDoc(doc(db, "issues", issue.id), {
      assignedTo: assignedToValue,
      status: "assigned", // ✅ auto move to assigned
      assignedAt: serverTimestamp(),
      assignedBy: user?.uid || null,
      statusHistory: [
        ...(issue.statusHistory || []),
        {
          status: "assigned",
          at: Timestamp.now(),
          note: `Assigned to ${assignedToValue}`
        }
      ],
      updatedAt: serverTimestamp()
    });
  };

  /* ---------- FILTER + SORT ---------- */
  const filtered = useMemo(() => {
    return issues.filter((i) => {
      // base filters
      const okStatus = filterStatus === "all" || i.status === filterStatus;
      const okCat = filterCategory === "all" || i.category === filterCategory;
      const okUrg = filterUrgency === "all" || i.urgency === filterUrgency;

      // assignment filters
      const isUnassigned = !i.assignedTo;
      const okUnassignedToggle = !onlyUnassigned || isUnassigned;

      let okAssigned = true;
      if (filterAssignedTo === "unassigned") okAssigned = isUnassigned;
      else if (filterAssignedTo !== "all") okAssigned = i.assignedTo === filterAssignedTo;

      return okStatus && okCat && okUrg && okAssigned && okUnassignedToggle;
    });
  }, [issues, filterStatus, filterCategory, filterUrgency, filterAssignedTo, onlyUnassigned]);

  const sortedIssues = [...filtered].sort((a, b) => {
    const slaDiff = attentionOrder[getSlaFlag(a)] - attentionOrder[getSlaFlag(b)];
    if (slaDiff !== 0) return slaDiff;

    const aScore = a.urgencyScore ?? urgencyRank[a.urgency] ?? 0;
    const bScore = b.urgencyScore ?? urgencyRank[b.urgency] ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

  /* ---------- HEATMAP ---------- */
  const hostelCounts = issues.reduce((acc, i) => {
    acc[i.location] = (acc[i.location] || 0) + 1;
    return acc;
  }, {});

  /* ---------- AI SUMMARY ---------- */
  const generateWeeklySummary = async () => {
    try {
      setAiLoading(true);

      const payload = issues.map((i) => ({
        title: i.title,
        category: i.category,
        location: i.location,
        urgency: i.urgency,
        status: i.status,
        assignedTo: i.assignedTo || null
      }));

      const fakeSummary = `
Top issues: Water and Electricity.
High urgency issues must be prioritized first.
Assignment distribution shows workload balancing opportunities.
      `.trim();

      setAiSummary(fakeSummary);
      console.log("AI input payload:", payload);
    } catch (e) {
      alert("Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '2rem', color: 'var(--primary)' }}>Admin Dashboard</h2>

<<<<<<< HEAD
      {/* AI SUMMARY */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <button onClick={generateWeeklySummary} disabled={aiLoading} className="btn-primary" style={{ marginBottom: '1rem' }}>
          {aiLoading ? 'Generating...' : 'Generate Weekly Summary'}
        </button>
=======
      <button onClick={generateWeeklySummary} disabled={aiLoading}>
        {aiLoading ? "Generating..." : "Generate Weekly Summary"}
      </button>
>>>>>>> 69c8893 (Initial commit)

        {aiSummary && (
          <div>
            <strong style={{ color: 'var(--primary)' }}>Weekly Summary</strong>
            <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-line' }}>{aiSummary}</p>
          </div>
        )}
      </div>

<<<<<<< HEAD
      {/* HEATMAP */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, color: 'var(--primary)' }}>Issue Distribution</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(hostelCounts).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '8px', borderBottom: '1px solid var(--glass-border)' }}>{k}</td>
                <td style={{ padding: '8px', borderBottom: '1px solid var(--glass-border)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FILTERS */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <select onChange={e => setFilterStatus(e.target.value)} style={{ flex: 1, minWidth: '150px' }}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="resolved">Resolved</option>
          </select>

          <select onChange={e => setFilterCategory(e.target.value)} style={{ flex: 1, minWidth: '150px' }}>
            <option value="all">All Categories</option>
            <option value="water">Water</option>
            <option value="electricity">Electricity</option>
            <option value="wifi">Wi-Fi</option>
            <option value="mess">Mess</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {/* ISSUES */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {sortedIssues.map(issue => {
          const sla = getSlaFlag(issue);
          return (
            <div key={issue.id} className="glass-panel" style={{ padding: '1.5rem' }}>
              <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{issue.title}</h4>
              <span style={{
                display: 'inline-block',
                marginBottom: '0.5rem',
                color: "#fff",
                padding: "4px 8px",
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: sla === "overdue" ? "var(--danger)" :
                            sla === "delayed" ? "var(--warning)" : "var(--success)"
              }}>
                {sla.toUpperCase()}
              </span>
              <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>Status: <span style={{ color: 'var(--primary)' }}>{issue.status}</span></p>
              <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>Urgency: {issue.urgency}</p>
              <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)' }}>Location: {issue.location}</p>
              <div style={{ marginTop: '1rem' }}>
                {issue.status === "open" && (
                  <button onClick={() => updateStatus(issue, "assigned")} className="btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>Assign</button>
                )}
                {issue.status === "assigned" && (
                  <button onClick={() => updateStatus(issue, "resolved")} className="btn-primary" style={{ width: '100%' }}>Resolve</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
=======
      <h3>Issue Distribution</h3>
      <table border="1" cellPadding="6">
        <tbody>
          {Object.entries(hostelCounts).map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* FILTERS */}
      <div style={{ margin: "12px 0" }}>
        <select onChange={(e) => setFilterStatus(e.target.value)} value={filterStatus}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          onChange={(e) => setFilterCategory(e.target.value)}
          value={filterCategory}
          style={{ marginLeft: 8 }}
        >
          <option value="all">All Categories</option>
          <option value="water">Water</option>
          <option value="electricity">Electricity</option>
          <option value="wifi">Wi-Fi</option>
          <option value="mess">Mess</option>
          <option value="maintenance">Maintenance</option>
          <option value="other">Other</option>
        </select>

        <select
          onChange={(e) => setFilterUrgency(e.target.value)}
          value={filterUrgency}
          style={{ marginLeft: 8 }}
        >
          <option value="all">All Urgency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* ✅ Assignment filters */}
        <select
          onChange={(e) => setFilterAssignedTo(e.target.value)}
          value={filterAssignedTo}
          style={{ marginLeft: 8 }}
        >
          <option value="all">All Assigned</option>
          <option value="unassigned">Unassigned Only</option>
          {STAFF_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <label style={{ marginLeft: 10 }}>
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(e) => setOnlyUnassigned(e.target.checked)}
          />{" "}
          Show only unassigned
        </label>
      </div>

      {/* ISSUES */}
      {sortedIssues.map((issue) => {
        const sla = getSlaFlag(issue);
        const isUnassigned = !issue.assignedTo;

        return (
          <div
            key={issue.id}
            style={{ border: "1px solid #ddd", padding: 10, marginBottom: 8 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{issue.title}</strong>
              <span
                style={{
                  marginLeft: 8,
                  color: "#fff",
                  padding: "2px 6px",
                  background:
                    sla === "overdue"
                      ? "#d32f2f"
                      : sla === "delayed"
                      ? "#f57c00"
                      : "#388e3c"
                }}
              >
                {sla.toUpperCase()}
              </span>
            </div>

            <p>Status: {issue.status}</p>
            <p>Category: {issue.category}</p>
            <p>Urgency: {issue.urgency}</p>
            <p>Location: {issue.location}</p>

            <p>
              Assigned To: <b>{staffLabel(issue.assignedTo)}</b>
            </p>

            {/* ✅ ASSIGN CONTROL */}
            {isUnassigned && issue.status === "open" && (
              <div style={{ marginTop: 10 }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) assignIssue(issue, v);
                  }}
                >
                  <option value="">Assign to...</option>
                  {STAFF_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 10 }}>
              {/* keep your flow */}
              {issue.status === "assigned" && (
                <>
                  <button onClick={() => updateStatus(issue, "in_progress")}>
                    Start Work
                  </button>
                  <button
                    onClick={() => updateStatus(issue, "resolved")}
                    style={{ marginLeft: 8 }}
                  >
                    Resolve
                  </button>
                </>
              )}

              {issue.status === "in_progress" && (
                <button onClick={() => updateStatus(issue, "resolved")}>
                  Resolve
                </button>
              )}
            </div>
          </div>
        );
      })}
>>>>>>> 69c8893 (Initial commit)
    </div>
  );
}
