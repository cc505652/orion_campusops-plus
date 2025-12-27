import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

/* ---------- SLA HELPERS ---------- */

const MS_IN_HOUR = 60 * 60 * 1000;
const urgencyRank = { high: 0, medium: 1, low: 2 };
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
    const assigned = issue.statusHistory?.find(h => h.status === "assigned");
    if (assigned && hoursSince(assigned.at) > 48) return "overdue";
  }

  return "on-time";
}

/* ---------- COMPONENT ---------- */

export default function AdminIssueList() {
  const [issues, setIssues] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  /* ---------- REALTIME FETCH ---------- */
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (!user) return;

      const q = query(
        collection(db, "issues"),
        orderBy("createdAt", "desc")
      );

      const unsubSnap = onSnapshot(q, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
        { status: nextStatus, at: issue.updatedAt }
      ],
      updatedAt: serverTimestamp()
    });
  };

  /* ---------- FILTER + SORT ---------- */
  const filtered = issues.filter(i =>
    (filterStatus === "all" || i.status === filterStatus) &&
    (filterCategory === "all" || i.category === filterCategory)
  );

  const sortedIssues = [...filtered].sort((a, b) => {
    const slaDiff =
      attentionOrder[getSlaFlag(a)] - attentionOrder[getSlaFlag(b)];
    if (slaDiff !== 0) return slaDiff;
    return urgencyRank[a.urgency] - urgencyRank[b.urgency];
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

      const payload = issues.map(i => ({
        title: i.title,
        category: i.category,
        location: i.location,
        urgency: i.urgency,
        status: i.status
      }));

      // 🔒 SAFE PLACEHOLDER
      // Replace this with Gemini / OpenAI call later
      const fakeSummary = `
Most issues are concentrated in hostel infrastructure, particularly water and electricity.
High urgency issues should be prioritized in Hostel A.
Focus admin resources on recurring maintenance issues to reduce SLA delays.
      `.trim();

      setAiSummary(fakeSummary);
    } catch (e) {
      alert("Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <h2>Admin Dashboard</h2>

      {/* AI SUMMARY */}
      <button onClick={generateWeeklySummary} disabled={aiLoading}>
        {aiLoading ? "Generating..." : "Generate Weekly Summary"}
      </button>

      {aiSummary && (
        <div style={{ border: "1px solid #ccc", padding: 10, margin: "12px 0" }}>
          <strong>Weekly Summary</strong>
          <p>{aiSummary}</p>
        </div>
      )}

      {/* HEATMAP */}
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
        <select onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
        </select>

        <select onChange={e => setFilterCategory(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="all">All Categories</option>
          <option value="water">Water</option>
          <option value="electricity">Electricity</option>
          <option value="wifi">Wi-Fi</option>
          <option value="mess">Mess</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {/* ISSUES */}
      {sortedIssues.map(issue => {
        const sla = getSlaFlag(issue);
        return (
          <div key={issue.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 8 }}>
            <strong>{issue.title}</strong>
            <span style={{
              marginLeft: 8,
              color: "#fff",
              padding: "2px 6px",
              background: sla === "overdue" ? "#d32f2f" :
                          sla === "delayed" ? "#f57c00" : "#388e3c"
            }}>
              {sla.toUpperCase()}
            </span>

            <p>Status: {issue.status}</p>
            <p>Urgency: {issue.urgency}</p>
            <p>Location: {issue.location}</p>

            {issue.status === "open" && (
              <button onClick={() => updateStatus(issue, "assigned")}>Assign</button>
            )}
            {issue.status === "assigned" && (
              <button onClick={() => updateStatus(issue, "resolved")}>Resolve</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
