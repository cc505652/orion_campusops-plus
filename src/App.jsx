import { useEffect, useState } from "react";
import Login from "./Login";
import SubmitIssue from "./SubmitIssue";
import IssueList from "./IssueList";
import AdminIssueList from "./AdminIssueList";
import Logout from "./Logout";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

function App() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setRole(null);
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      setRole(snap.data().role);
    });

    return () => unsub();
  }, []);

  if (!role) return <Login onLogin={() => {}} />;

  return (
    <>
      <Logout />

      {role === "student" && (
        <>
          <SubmitIssue />
          <hr />
          <IssueList />
        </>
      )}

      {role === "admin" && <AdminIssueList />}
    </>
  );
}

export default App;
