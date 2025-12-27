import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function SubmitIssue() {

  const submitTestIssue = async () => {
    const user = auth.currentUser;

    if (!user) {
      alert("Not logged in");
      return;
    }

    try {
      await addDoc(collection(db, "issues"), {
        title: "Test Issue",
        description: "Testing Firestore write from UI",
        category: "water",
        location: "Hostel A",
        urgency: "high",
        status: "open",
        createdBy: user.uid,
        assignedTo: null,
        isAnonymous: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert("Issue written successfully!");
    } catch (err) {
      console.error(err);
      alert("Error writing issue");
    }
  };

  return (
    <div>
      <h2>Firestore Write Test</h2>
      <button onClick={submitTestIssue}>Submit Test Issue</button>
    </div>
  );
}
