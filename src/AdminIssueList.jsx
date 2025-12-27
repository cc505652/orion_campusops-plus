import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

export default function AdminIssueList() {
  const [issues, setIssues] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) return;

      const q = query(
        collection(db, "issues"),
        orderBy("createdAt", "desc")
      );

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((docu) => ({
          id: docu.id,
          ...docu.data()
        }));
        setIssues(data);
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, []);

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, "issues", id), {
      status,
      updatedAt: new Date()
    });
  };

  const filteredIssues = issues.filter((issue) => {
    const statusMatch =
      filterStatus === "all" || issue.status === filterStatus;

    const categoryMatch =
      filterCategory === "all" || issue.category === filterCategory;

    return statusMatch && categoryMatch;
  });

  return (
    <div>
      <h2>Admin Dashboard</h2>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <select onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="all">All Categories</option>
          <option value="water">Water</option>
          <option value="electricity">Electricity</option>
          <option value="wifi">Wi-Fi</option>
          <option value="mess">Mess</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {/* Issues */}
      {filteredIssues.length === 0 && <p>No issues found.</p>}

      {filteredIssues.map((issue) => (
        <div
          key={issue.id}
          style={{
            border: "1px solid #ccc",
            marginBottom: 10,
            padding: 10
          }}
        >
          <strong>{issue.title}</strong>

          <p>
            Status: <strong>{issue.status.toUpperCase()}</strong>
          </p>
          <p>Category: {issue.category}</p>
          <p>Location: {issue.location}</p>
          <p>Urgency: {issue.urgency}</p>

          {issue.status === "open" && (
            <button onClick={() => updateStatus(issue.id, "assigned")}>
              Mark Assigned
            </button>
          )}

          {issue.status === "assigned" && (
            <button onClick={() => updateStatus(issue.id, "resolved")}>
              Mark Resolved
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
