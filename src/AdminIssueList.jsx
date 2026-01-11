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
import { app, auth, db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
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

/* ---------- TIME HELPERS (PREMIUM) ---------- */

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

function formatTimeAgo(ms) {
  if (!ms) return "—";
  const diff = Date.now() - ms;

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const SLA_HOURS = {
  open: 24, // must be assigned within 24h
  assigned: 48 // must be resolved within 48h after assigned
};

function formatDuration(ms) {
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / (60 * 1000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function getSlaDisplay(issue) {
  const createdAtMs = tsToMillis(issue.createdAt);
  const now = Date.now();
  if (!createdAtMs) return { label: "SLA: —", color: "#999" };

  if (issue.status === "open") {
    const deadline = createdAtMs + SLA_HOURS.open * 60 * 60 * 1000;
    const remaining = deadline - now;
    if (remaining >= 0) {
      return { label: `SLA: ${formatDuration(remaining)} left`, color: "#1b5e20" };
    }
    return { label: `SLA BREACHED: ${formatDuration(remaining)} ago`, color: "#b71c1c" };
  }

  if (issue.status === "assigned" || issue.status === "in_progress") {
    const assignedEntry = issue.statusHistory?.find((h) => h.status === "assigned");
    const assignedAtMs = tsToMillis(assignedEntry?.at) || createdAtMs;

    const deadline = assignedAtMs + SLA_HOURS.assigned * 60 * 60 * 1000;
    const remaining = deadline - now;
    if (remaining >= 0) {
      return { label: `SLA: ${formatDuration(remaining)} left`, color: "#1b5e20" };
    }
    return { label: `SLA BREACHED: ${formatDuration(remaining)} ago`, color: "#b71c1c" };
  }

  return { label: "SLA: complete", color: "#0d47a1" };
}

/* ---------- PREMIUM BADGES ---------- */

function pillStyle(bg, fg = "#fff") {
  return {
    background: bg,
    color: fg,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: "16px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6
  };
}

function statusPill(status) {
  if (status === "open") return pillStyle("#fb8c00"); // orange
  if (status === "assigned") return pillStyle("#1976d2"); // blue
  if (status === "in_progress") return pillStyle("#6a1b9a"); // purple
  if (status === "resolved") return pillStyle("#2e7d32"); // green
  return pillStyle("#455a64"); // grey
}

function urgencyPill(urg) {
  if (urg === "high") return pillStyle("#d32f2f");
  if (urg === "medium") return pillStyle("#f57c00");
  if (urg === "low") return pillStyle("#388e3c");
  return pillStyle("#455a64");
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

  // ✅ Live refresh tick (so "12 min ago" updates)
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all");
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
    // nowTick referenced so it reruns renders; not needed here for filtering
    void nowTick;

    return issues.filter((i) => {
      if (!showDeleted && i.isDeleted) return false;

      const okStatus = filterStatus === "all" || i.status === filterStatus;
      const okCat = filterCategory === "all" || i.category === filterCategory;
      const okUrg = filterUrgency === "all" || i.urgency === filterUrgency;

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
    showDeleted,
    nowTick
  ]);

  const sortedIssues = [...filtered].sort((a, b) => {
    const slaDiff = attentionOrder[getSlaFlag(a)] - attentionOrder[getSlaFlag(b)];
    if (slaDiff !== 0) return slaDiff;

    const aScore = a.urgencyScore ?? urgencyRank[a.urgency] ?? 0;
    const bScore = b.urgencyScore ?? urgencyRank[b.urgency] ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    const aTime = tsToMillis(a.createdAt);
    const bTime = tsToMillis(b.createdAt);
    return bTime - aTime;
  });

  /* ---------- HEATMAP ---------- */
  const hostelCounts = useMemo(() => {
    return issues.reduce((acc, i) => {
      if (i.isDeleted) return acc;
      acc[i.location] = (acc[i.location] || 0) + 1;
      return acc;
    }, {});
  }, [issues]);

  /* ---------- AI SUMMARY ---------- */
  const generateWeeklySummary = async () => {
  try {
    setAiLoading(true);

    // ✅ last 7 days issues
    const last7 = issues
      .filter((i) => !i.isDeleted)
      .filter((i) => {
        const ms = i.createdAt?.toMillis?.() ?? 0;
        return ms > Date.now() - 7 * 24 * 60 * 60 * 1000;
      });

    // ✅ compute accurate stats
    const byCategory = {};
    const byUrgency = {};
    const byLocation = {};
    const byAssigned = {};
    let slaBreached = 0;
    let resolvedCount = 0;

    for (const i of last7) {
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
      byUrgency[i.urgency] = (byUrgency[i.urgency] || 0) + 1;
      byLocation[i.location] = (byLocation[i.location] || 0) + 1;

      const ass = i.assignedTo || "unassigned";
      byAssigned[ass] = (byAssigned[ass] || 0) + 1;

      const sla = getSlaDisplay(i);
      if (sla.label.startsWith("SLA BREACHED")) slaBreached++;

      if (i.status === "resolved") resolvedCount++;
    }

    const hotspots = Object.entries(byLocation)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const stats = {
      totalIssues: last7.length,
      resolvedCount,
      slaBreached,
      byCategory,
      byUrgency,
      hotspots,
      byAssigned
    };

    // ✅ base accurate summary text
    const accurateSummary = `
Weekly Ops Summary (Last 7 Days)

✅ Total Issues: ${stats.totalIssues}
✅ Resolved: ${stats.resolvedCount}
⚠ SLA Breached: ${stats.slaBreached}

🏠 Top Hotspots:
${stats.hotspots.length ? stats.hotspots.map((h, idx) => `${idx + 1}) ${h.location}: ${h.count}`).join("\n") : "—"}

📌 Category Breakdown:
${Object.entries(stats.byCategory).length
  ? Object.entries(stats.byCategory).map(([k, v]) => `- ${k}: ${v}`).join("\n")
  : "—"}

⚡ Urgency Breakdown:
${Object.entries(stats.byUrgency).length
  ? Object.entries(stats.byUrgency).map(([k, v]) => `- ${k}: ${v}`).join("\n")
  : "—"}
`.trim();

    // ✅ Call Gemini narration via Cloud Function
    const functions = getFunctions(app, "asia-south1");
    const fn = httpsCallable(functions, "generateAiOpsNarration");

    let aiNarration = "";
    try {
      const res = await fn({ stats });
      aiNarration = res.data?.narration || "";
    } catch (err) {
      console.error("AI narration failed, fallback to accurate summary only:", err);
      aiNarration = "";
    }

    const finalSummary =
      accurateSummary +
      (aiNarration ? `\n\n---\n\n🤖 AI Recommendations:\n${aiNarration}` : "");

    setAiSummary(finalSummary);
  } catch (e) {
    console.error(e);
    alert("Failed to generate weekly summary");
  } finally {
    setAiLoading(false);
  }
};


  /* ---------- UI ---------- */
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>Admin Dashboard</h2>

      {/* AI SUMMARY */}
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={generateWeeklySummary} disabled={aiLoading}>
            {aiLoading ? "Generating..." : "Generate Weekly Summary"}
          </button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Premium: Ops insights + action suggestions
          </span>
        </div>

        {aiSummary && (
          <div style={{ marginTop: 10 }}>
            <strong>Weekly Summary</strong>
            <p style={{ marginTop: 6, whiteSpace: "pre-line" }}>{aiSummary}</p>
          </div>
        )}
      </div>

      {/* HEATMAP */}
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 12, marginBottom: 16 }}>
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
      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 12, marginBottom: 16 }}>
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: 14
        }}
      >
        {sortedIssues.map((issue) => {
          const slaFlag = getSlaFlag(issue);
          const slaDisplay = getSlaDisplay(issue);
          const isUnassigned = !issue.assignedTo;

          const createdMs = tsToMillis(issue.createdAt);
          const updatedMs = tsToMillis(issue.updatedAt);

          return (
            <div
              key={issue.id}
              style={{
                border: "1px solid #ddd",
                padding: 14,
                borderRadius: 14,
                boxShadow: "0 6px 16px rgba(0,0,0,0.04)"
              }}
            >
              {/* HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{issue.title}</strong>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={statusPill(issue.status)}>
                      {issue.status?.toUpperCase() || "STATUS"}
                    </span>

                    <span style={urgencyPill(issue.urgency)}>
                      ⚡ {issue.urgency?.toUpperCase() || "URGENCY"}
                    </span>

                    <span style={pillStyle(slaFlag === "overdue" ? "#b71c1c" : slaFlag === "delayed" ? "#f57c00" : "#1b5e20")}>
                      ⏱ {slaFlag.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* META */}
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ opacity: 0.8 }}>
                    🕒 Reported: <b>{formatTimeAgo(createdMs)}</b>
                  </span>
                  <span style={{ opacity: 0.8 }}>
                    ♻ Updated: <b>{updatedMs ? formatTimeAgo(updatedMs) : "—"}</b>
                  </span>
                </div>

                <div style={{ fontWeight: 800, color: slaDisplay.color }}>
                  {slaDisplay.label}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <span>📌 Category: <b>{issue.category}</b></span>
                  <span>📍 Location: <b>{issue.location}</b></span>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={pillStyle("#263238")}>👷 {staffLabel(issue.assignedTo)}</span>
                </div>
              </div>

              {/* ASSIGN */}
              {isUnassigned && issue.status === "open" && (
                <div style={{ marginTop: 12 }}>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) assignIssue(issue, v);
                    }}
                    style={{ width: "100%", padding: 10, borderRadius: 10 }}
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
