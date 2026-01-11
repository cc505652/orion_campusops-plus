import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

const statusLabel = (s) => {
  if (s === "open") return "Open";
  if (s === "assigned") return "Assigned";
  if (s === "in_progress") return "In Progress";
  if (s === "resolved") return "Resolved";
  if (s === "merged") return "Merged";
  return s || "Unknown";
};

const assignedLabel = (v) => {
  if (!v) return "Unassigned";
  if (v === "plumber") return "Plumber";
  if (v === "electrician") return "Electrician";
  if (v === "wifi_team") return "WiFi/Network Team";
  if (v === "mess_supervisor") return "Mess Supervisor";
  if (v === "maintenance") return "Maintenance/Carpenter";
  return v;
};

export default function IssueList() {
  const [issues, setIssues] = useState([]);
  const [sortMode, setSortMode] = useState("newest"); // newest | priority

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) return;

      const q = query(
        collection(db, "issues"),
        where("createdBy", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));

        // ✅ NEW: hide deleted issues from students
        setIssues(data.filter((i) => !i.isDeleted));
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, []);

  // optional client sorting for priority view
  const displayIssues = [...issues].sort((a, b) => {
    if (sortMode !== "priority") {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    }

    const aScore = a.urgencyScore ?? 0;
    const bScore = b.urgencyScore ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

  return (
    <div style={{ padding: 16 }}>
      <h2>My Issues</h2>

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>Sort:</label>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="priority">Priority (High → Low)</option>
        </select>
      </div>

      {displayIssues.length === 0 && <p>No issues yet.</p>}

      {displayIssues.map((issue) => (
        <div
          key={issue.id}
          style={{
            border: "1px solid #ccc",
            margin: 10,
            padding: 12,
            borderRadius: 10
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 16 }}>{issue.title}</strong>

            <span
              style={{
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: "1px solid #999"
              }}
            >
              {statusLabel(issue.status)}
            </span>
          </div>

          {issue.description && (
            <p style={{ marginTop: 8, marginBottom: 6 }}>{issue.description}</p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
            <span>📌 Category: <b>{issue.category || "—"}</b></span>
            <span>⚡ Urgency: <b>{issue.urgency || "—"}</b></span>
            <span>📍 Location: <b>{issue.location || "—"}</b></span>
            <span>👷 Assigned To: <b>{assignedLabel(issue.assignedTo)}</b></span>
          </div>

          {/* optional debug field - keep/remove as you want */}
          {issue.autoReason && (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              🤖 Auto-tagging: {issue.autoReason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
