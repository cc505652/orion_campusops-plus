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

  // filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all"); // all | unassigned | plumber...
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // deleted visibility
  const [showDeleted, setShowDeleted] = useState(false);

  // AI summary
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

  /* ---------- STAFF ASSIGN ---------- */
  const assignIssue = async (issue, assignedToValue) => {
    const user = auth.currentUser;

    await updateDoc(doc(db, "issues", issue.id), {
      assignedTo: assignedToValue,
      status: "assigned",
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

  /* ---------- DELETE COMPLETED (SOFT DELETE) ---------- */
  const deleteResolvedIssue = async (issue) => {
    const ok = window.confirm(`Delete resolved issue?\n\n"${issue.title}"`);
    if (!ok) return;

    const user = auth.currentUser;

    await updateDoc(doc(db, "issues", issue.id), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user?.uid || null,
      statusHistory: [
        ...(issue.statusHistory || []),
        {
          status: "deleted",
          at: Timestamp.now(),
          note: "Deleted by admin"
        }
      ],
      updatedAt: serverTimestamp()
    });
  };

  /* ---------- FILTER + SORT ---------- */
  const filtered = useMemo(() => {
    return issues.filter((i) => {
      // hide deleted unless toggled
      if (!showDeleted && i.isDeleted) return false;

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
  }, [
    issues,
    filterStatus,
    filterCategory,
    filterUrgency,
    filterAssignedTo,
    onlyUnassigned,
    showDeleted
  ]);

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
  const hostelCounts = useMemo(() => {
    return issues.reduce((acc, i) => {
      if (i.isDeleted) return acc; // exclude deleted from heatmap
      acc[i.location] = (acc[i.location] || 0) + 1;
      return acc;
    }, {});
  }, [issues]);

  /* ---------- AI SUMMARY ---------- */
  const generateWeeklySummary = async () => {
    try {
      setAiLoading(true);

      const payload = issues
        .filter((i) => !i.isDeleted)
        .map((i) => ({
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

  /* ---------- UI ---------- */
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>Admin Dashboard</h2>

      {/* AI SUMMARY */}
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10, marginBottom: 16 }}>
        <button onClick={generateWeeklySummary} disabled={aiLoading}>
          {aiLoading ? "Generating..." : "Generate Weekly Summary"}
        </button>

        {aiSummary && (
          <div style={{ marginTop: 10 }}>
            <strong>Weekly Summary</strong>
            <p style={{ marginTop: 6, whiteSpace: "pre-line" }}>{aiSummary}</p>
          </div>
        )}
      </div>

      {/* HEATMAP */}
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Issue Distribution</h3>
        <table border="1" cellPadding="6" style={{ width: "100%" }}>
          <tbody>
            {Object.entries(hostelCounts).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FILTERS */}
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select onChange={(e) => setFilterStatus(e.target.value)} value={filterStatus}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <select onChange={(e) => setFilterCategory(e.target.value)} value={filterCategory}>
            <option value="all">All Categories</option>
            <option value="water">Water</option>
            <option value="electricity">Electricity</option>
            <option value="wifi">Wi-Fi</option>
            <option value="mess">Mess</option>
            <option value="maintenance">Maintenance</option>
            <option value="other">Other</option>
          </select>

          <select onChange={(e) => setFilterUrgency(e.target.value)} value={filterUrgency}>
            <option value="all">All Urgency</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select onChange={(e) => setFilterAssignedTo(e.target.value)} value={filterAssignedTo}>
            <option value="all">All Assigned</option>
            <option value="unassigned">Unassigned Only</option>
            {STAFF_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={onlyUnassigned}
              onChange={(e) => setOnlyUnassigned(e.target.checked)}
            />
            Show only unassigned
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Show deleted
          </label>
        </div>
      </div>

      {/* ISSUES GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {sortedIssues.map((issue) => {
          const sla = getSlaFlag(issue);
          const isUnassigned = !issue.assignedTo;

          return (
            <div
              key={issue.id}
              style={{ border: "1px solid #ddd", padding: 12, borderRadius: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{issue.title}</strong>
                <span
                  style={{
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background:
                      sla === "overdue" ? "#d32f2f" : sla === "delayed" ? "#f57c00" : "#388e3c"
                  }}
                >
                  {sla.toUpperCase()}
                </span>
              </div>

              <p style={{ margin: "8px 0" }}>Status: <b>{issue.status}</b></p>
              <p style={{ margin: "8px 0" }}>Category: <b>{issue.category}</b></p>
              <p style={{ margin: "8px 0" }}>Urgency: <b>{issue.urgency}</b></p>
              <p style={{ margin: "8px 0" }}>Location: <b>{issue.location}</b></p>

              <p style={{ margin: "8px 0" }}>
                Assigned To: <b>{staffLabel(issue.assignedTo)}</b>
              </p>

              {/* ASSIGN */}
              {isUnassigned && issue.status === "open" && (
                <div style={{ marginTop: 10 }}>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) assignIssue(issue, v);
                    }}
                    style={{ width: "100%" }}
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

              {/* ACTIONS */}
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {issue.status === "assigned" && (
                  <>
                    <button onClick={() => updateStatus(issue, "in_progress")}>Start Work</button>
                    <button onClick={() => updateStatus(issue, "resolved")}>Resolve</button>
                  </>
                )}

                {issue.status === "in_progress" && (
                  <button onClick={() => updateStatus(issue, "resolved")}>Resolve</button>
                )}

                {/* ✅ DELETE COMPLETED TASK */}
                {issue.status === "resolved" && !issue.isDeleted && (
                  <button
                    onClick={() => deleteResolvedIssue(issue)}
                    style={{ background: "#d32f2f", color: "#fff" }}
                  >
                    Delete
                  </button>
                )}

                {issue.isDeleted && (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>🗑 Deleted</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
