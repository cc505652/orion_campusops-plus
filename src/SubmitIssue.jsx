import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { autoClassify, urgencyToScore } from "./utils/autoClassify";

export default function SubmitIssue() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // optional manual overrides
  const [category, setCategory] = useState("");
  const [urgency, setUrgency] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      alert("You are not logged in.");
      return;
    }

    if (!title.trim()) {
      alert("Please enter a title.");
      return;
    }

    setSubmitting(true);
    try {
      const auto = autoClassify(title, description);

      const finalCategory = category || auto.category;
      const finalUrgency = urgency || auto.urgency;
      const urgencyScore = urgencyToScore(finalUrgency);

      const location = "Hostel A"; // keep your current logic

      await addDoc(collection(db, "issues"), {
        title,
        description,

        category: finalCategory,
        urgency: finalUrgency,
        urgencyScore,

        location,
        status: "open",
        assignedTo: null,

        statusHistory: [{ status: "open", at: Timestamp.now() }],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        autoReason: auto.reason
      });

      setTitle("");
      setDescription("");
      setCategory("");
      setUrgency("");
    } catch (err) {
      console.error("Submit failed:", err.code, err.message);
      alert(`Submit failed: ${err.code}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: 12 }}>
      <h3>Report Issue</h3>

      <input
        placeholder="Issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 10 }}
      />

      <textarea
        placeholder="Describe the issue (recommended)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        style={{ width: "100%", padding: 10, marginTop: 10 }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Auto Category</option>
          <option value="water">Water</option>
          <option value="electricity">Electricity</option>
          <option value="wifi">Wi-Fi</option>
          <option value="mess">Mess</option>
          <option value="maintenance">Maintenance</option>
          <option value="other">Other</option>
        </select>

        <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="">Auto Urgency</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
