import { autoClassify, urgencyToScore } from "./utils/autoClassify";
import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import { auth, db } from "./firebase";

/* ---------- TEXT HELPERS ---------- */

function normalizeText(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similarity score (Jaccard-like)
 * 1.0 = identical word set, 0.0 = no overlap
 */
function similarityScore(a = "", b = "") {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(A.size, B.size || 1);
}

/**
 * Normalizer for ELECTRICITY duplicates:
 * - short circuit, sparking, sparks, burning smell, shock -> spark
 */
function normalizeElectricityText(t = "") {
  return normalizeText(t)
    .replace(/\bshort circuit\b/g, "spark")
    .replace(/\bsparking\b/g, "spark")
    .replace(/\bsparks\b/g, "spark")
    .replace(/\bburning smell\b/g, "spark")
    .replace(/\bshock\b/g, "spark");
}

/* ---------- DUPLICATE HELPERS ---------- */

function keywordFingerprint(title = "", description = "") {
  const text = normalizeText(`${title} ${description}`);
  const words = text.split(" ").filter((w) => w.length >= 4);
  return words.slice(0, 6).join("-");
}

/**
 * ✅ IMPORTANT:
 * Duplicate check MUST NEVER block submission.
 * If Firestore index is missing, we return null and still submit.
 */
async function findPossibleDuplicateSafe({ category, location, title, description }) {
  try {
    const since = Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000); // 12h window

    // Index-friendly query: inequality + orderBy same field
    const q = query(
      collection(db, "issues"),
      where("category", "==", category),
      where("location", "==", location),
      where("createdAt", ">", since),
      orderBy("createdAt", "desc"),
      limit(25)
    );

    const snap = await getDocs(q);

    const newTextRaw = `${title} ${description}`.trim();
    const newText =
      category === "electricity"
        ? normalizeElectricityText(newTextRaw)
        : normalizeText(newTextRaw);

    let best = { id: null, score: 0 };

    for (const d of snap.docs) {
      const data = d.data();
      if (data.status === "merged") continue;

      const oldTextRaw = `${data.title || ""} ${data.description || ""}`.trim();
      const oldText =
        category === "electricity"
          ? normalizeElectricityText(oldTextRaw)
          : normalizeText(oldTextRaw);

      const score = similarityScore(newText, oldText);

      if (score > best.score) best = { id: d.id, score };
    }

    // ✅ Threshold tuned for "short circuit" vs "sparking" detection
    return best.score >= 0.45 ? best.id : null;
  } catch (err) {
    console.error("Duplicate detection skipped (non-blocking):", err.code, err.message);
    return null; // ✅ never break submission
  }
}

/* ---------- COMPONENT ---------- */

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
      // ✅ Auto classify
      const auto = autoClassify(title, description);

      const finalCategory = category || auto.category;
      const finalUrgency = urgency || auto.urgency;

      const urgencyScore = urgencyToScore(finalUrgency);

      // keep your current logic
      const location = "Hostel A";

      // ✅ Non-blocking duplicate detection (improved)
      const possibleDuplicateOf = await findPossibleDuplicateSafe({
        category: finalCategory,
        location,
        title,
        description
      });

      const duplicateGroupId = `${finalCategory}|${normalizeText(location)}|${keywordFingerprint(
        title,
        description
      )}`;

      await addDoc(collection(db, "issues"), {
        title,
        description,

        category: finalCategory,
        urgency: finalUrgency,
        urgencyScore,

        location,
        status: "open",
        assignedTo: null,

        // ✅ duplicate system fields
        possibleDuplicateOf: possibleDuplicateOf || null,
        masterIssueId: null,
        duplicatesCount: 0,
        duplicateGroupId,

        statusHistory: [{ status: "open", at: Timestamp.now() }],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        autoReason: auto.reason
      });

      // reset
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
    <div className="glass-panel" style={{ maxWidth: '500px', margin: '0 auto 2rem', padding: '2rem' }}>
      <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Report Issue</h3>

<<<<<<< HEAD
      <form onSubmit={submit}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            placeholder="Issue title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              checkDuplicates(e.target.value);
            }}
            required
          />
        </div>

        {warning && <p style={{ color: 'var(--warning)', marginBottom: '1rem' }}>{warning}</p>}

        <div style={{ marginBottom: '1rem' }}>
          <select value={category} onChange={e => setCategory(e.target.value)} required>
            <option value="">Category</option>
            <option value="water">Water</option>
            <option value="electricity">Electricity</option>
            <option value="wifi">Wi-Fi</option>
            <option value="mess">Mess</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <select value={urgency} onChange={e => setUrgency(e.target.value)} required>
            <option value="">Urgency</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <button type="submit" className="btn-primary">Submit Issue</button>
      </form>
    </div>
=======
      <input
        placeholder="Issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Describe the issue (recommended)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        style={{ width: "100%", marginTop: 8 }}
      />

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{ marginTop: 8 }}
      >
        <option value="">Auto Category</option>
        <option value="water">Water</option>
        <option value="electricity">Electricity</option>
        <option value="wifi">Wi-Fi</option>
        <option value="mess">Mess</option>
        <option value="maintenance">Maintenance</option>
        <option value="other">Other</option>
      </select>

      <select
        value={urgency}
        onChange={(e) => setUrgency(e.target.value)}
        style={{ marginLeft: 8 }}
      >
        <option value="">Auto Urgency</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <button type="submit" style={{ marginLeft: 8 }} disabled={submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </form>
>>>>>>> 69c8893 (Initial commit)
  );
}
