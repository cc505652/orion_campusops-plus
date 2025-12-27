import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

export default function IssueList() {
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    console.log("IssueList mounted");

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      console.log("Auth state changed:", user?.uid);

      if (!user) return;

      const q = query(
        collection(db, "issues"),
        where("createdBy", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        console.log("🔥 Snapshot fired, docs:", snapshot.size);

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setIssues(data);
      });

      // cleanup snapshot on logout
      return () => unsubscribeSnapshot();
    });

    // cleanup auth listener
    return () => unsubscribeAuth();
  }, []);

  return (
    <div>
      <h2>My Issues</h2>

      {issues.length === 0 && <p>No issues yet.</p>}

      {issues.map(issue => (
        <div key={issue.id} style={{ border: "1px solid #ccc", margin: 8, padding: 8 }}>
          <strong>{issue.title}</strong>
          <p>Status: {issue.status}</p>
        </div>
      ))}
    </div>
  );
}
