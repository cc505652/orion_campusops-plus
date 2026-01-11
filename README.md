# CampusOps+ 🚀  
**Smart Hostel & Academic Infrastructure Issue Management System (MPSTME Shirpur)**

CampusOps+ is a smart campus operations platform designed for **residential campuses** like **MPSTME Shirpur**.  
It enables students to report infrastructure problems instantly (water, electricity, WiFi, mess, maintenance), while admins track, prioritize, assign, and resolve issues efficiently using real-time dashboards.

Built for **GDG on Campus ORION TechSprint**.

---

## ✨ Key Highlights

- ✅ **Student Dashboard** to report issues with real-time tracking  
- ✅ **Admin Console** to manage, assign, escalate & resolve issues  
- ✅ **Realtime Updates** powered by **Firebase Firestore**
- ✅ **SLA Tracking + Escalation Workflow**
- ✅ **AI Categorization & Priority Scoring** (auto-routing to correct category/urgency)
- ✅ **Evidence Image Upload + Evidence Gallery**
- ✅ **Weekly Operations Summary (Accurate)** + optional AI narration
- ✅ Hosted using **Firebase Hosting**

---

## 🧩 Problem We’re Solving

In residential campuses, students frequently face issues such as:
- leakage in hostels
- short-circuits / sparking
- WiFi downtime
- mess hygiene / purifier failures
- maintenance (locks, fans, windows)

Current system is manual and slow → delays resolution and lacks accountability.

CampusOps+ provides a **single source of truth** for campus infrastructure issues with **prioritized workflows** and **SLA-based escalation**.

---

## ✅ Features (Currently Integrated)

### 👨‍🎓 Student Side
- **Signup/Login using Email & Password** (Firebase Auth)
- Create & submit infrastructure issues:
  - Title, Description
  - Location (Hostel/Block/Mess/Library etc.)
  - Category selection supported
- **Issue tracking**
  - View issues created by the logged-in student
  - Live status updates (open → assigned → in_progress → resolved)
- **Evidence Upload**
  - Student can upload a photo proof (leakage/sparking/damage etc.)
  - Stored and linked properly for admin verification

---

### 🧑‍💻 Admin Side
- **Admin Dashboard Console**
  - View all issues from campus in real time
  - Auto-sorted by **priority & urgency score**
- **Filters**
  - Category filter (water/electricity/wifi/mess/maintenance)
  - Urgency filter (low/medium/high)
  - Status filter (open/assigned/in_progress/resolved)
  - Assigned-to filter + “unassigned only”
- **Issue Assignment**
  - Assign issues to staff teams:
    - plumber
    - electrician
    - wifi/network team
    - mess supervisor
    - maintenance
- **Status Workflow**
  - Start Work (in_progress)
  - Resolve issue (resolved)
- **Manual Delete of Completed Tickets**
  - Resolved tickets can be deleted by admin (soft delete)
- **Status Timeline**
  - Every status change is tracked in history with timestamps

---

### ⏱ SLA Tracking + Escalation
- SLA logic tracks delays automatically:
  - **Open too long**
  - **Assigned too long**
- SLA countdown displayed clearly on every issue card
- **Escalate to Warden** button appears when SLA breached
- Escalation added into timeline and tracked in Firestore

---

### 🖼 Evidence Gallery (Admin Premium Feature)
- Admin can open a **central Evidence Gallery**
- Shows all uploaded images with:
  - category tag
  - urgency tag
  - status tag
  - location
- Designed for faster verification during high volume reporting

---

### 📊 Weekly Summary Dashboard
Admin can generate a weekly operations report:
- Total issues in last 7 days
- Resolved count
- SLA breached count
- Category breakdown
- Urgency breakdown
- Top hotspots (locations)

✅ Summary stats are always accurate (computed from Firestore)

🤖 Optional AI narration:
- Gemini-powered narration/recommendations (if cloud function enabled)
- Has fallback if AI is unavailable

---

## 🏗 Tech Stack

### Frontend
- **React (Vite)**
- JSX components
- Modern UI + filters + responsive cards

### Backend / Cloud
- **Firebase Auth** (Email/password login)
- **Firebase Firestore** (Realtime database)
- **Firebase Storage** (Evidence images)
- **Firebase Hosting** (Deployment)

### AI Layer (Integrated)
- AI-based categorization / urgency scoring (keyword/logic-based + cloud AI optional)
- Optional AI narrative function for weekly report

---

## 📂 Project Structure

```bash
src/
  AdminIssueList.jsx        # Admin console (assignment, SLA, escalation, summary)
  IssueList.jsx             # Student issue list
  SubmitIssue.jsx           # Student issue submission form
  Login.jsx                 # Auth login
  Logout.jsx                # Sign out
  firebase.js               # Firebase init (auth/db/storage)
  main.jsx
  App.jsx
  index.css
